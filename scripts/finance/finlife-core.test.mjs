import test from 'node:test';
import assert from 'node:assert/strict';
import {productRows,rowKey,changed} from './finlife-core.mjs';

const result={
 baseList:[{dcls_month:'202610',fin_co_no:'0010001',fin_prdt_cd:'1054',kor_co_nm:'우리은행',fin_prdt_nm:'우리아파트론',join_way:'영업점,모집인',loan_lmt:'LTV 70%'}],
 optionList:[
  {dcls_month:'202610',fin_co_no:'0010001',fin_prdt_cd:'1054',mrtg_type_nm:'아파트',rpay_type_nm:'분할상환방식',lend_rate_type_nm:'고정금리',lend_rate_min:5.39,lend_rate_max:6.59,lend_rate_avg:6.03},
  {dcls_month:'202610',fin_co_no:'0010001',fin_prdt_cd:'1054',mrtg_type_nm:'아파트',rpay_type_nm:'분할상환방식',lend_rate_type_nm:'변동금리',lend_rate_min:4.1,lend_rate_max:5.2,lend_rate_avg:null},
  {dcls_month:'202610',fin_co_no:'9999999',fin_prdt_cd:'1',mrtg_type_nm:'아파트',rpay_type_nm:'분할상환방식',lend_rate_type_nm:'고정금리',lend_rate_min:1,lend_rate_max:2},
 ],
};

test('productRows joins each option to its product and the company homepage',()=>{
 const rows=productRows('mortgage','020000',result,new Map([['0010001','https://www.wooribank.com']]));
 assert.equal(rows.length,2,'an option without its product is dropped');
 assert.deepEqual(rows[0],{product_kind:'mortgage',fin_group:'은행',fin_co_code:'0010001',fin_co_name:'우리은행',homepage_url:'https://www.wooribank.com',
  product_code:'1054',product_name:'우리아파트론',collateral_type:'아파트',repayment_type:'분할상환방식',rate_type:'고정금리',
  rate_min:5.39,rate_max:6.59,rate_avg:6.03,loan_limit:'LTV 70%',join_way:'영업점,모집인',disclosure_month:'2026-10'});
 assert.equal(rows[1].rate_avg,null);
 assert.notEqual(rowKey(rows[0]),rowKey(rows[1]));
});

test('productRows leaves collateral empty for 전세대출',()=>{
 const rows=productRows('jeonse','050000',result,new Map());
 assert.equal(rows[0].collateral_type,'');
 assert.equal(rows[0].fin_group,'보험');
 assert.equal(rows[0].homepage_url,null);
});

test('changed ignores numeric formatting but sees a new rate',()=>{
 const fresh=productRows('mortgage','020000',result,new Map())[0];
 const stored={...fresh,rate_min:'5.39',rate_max:'6.59',rate_avg:'6.03'};
 assert.equal(changed(stored,fresh),false);
 assert.equal(changed(stored,{...fresh,rate_min:5.29}),true);
 assert.equal(changed({...stored,rate_avg:null},{...fresh,rate_avg:null}),false);
});
