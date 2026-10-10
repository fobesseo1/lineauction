import {expect,it} from 'vitest';
import {renderToString} from 'react-dom/server';
import {createElement} from 'react';
import {PropertyCover} from '@/components/property/property-cover';
it('missing photos link to the property address on Naver without inventing a photo',()=>{
 const markup=renderToString(createElement(PropertyCover,{title:'물건',source:'onbid',href:'/properties/test',address:'경기도 하남시 신장동 610',src:null}));
 expect(markup).toContain(`https://map.naver.com/p/search/${encodeURIComponent('경기도 하남시 신장동 610')}`);
 expect(markup).not.toContain('<img');
 expect(markup).toContain('네이버지도에서 위치 보기');
});
it('missing exact addresses use the provided region rather than an unrelated default location',()=>{
 const markup=renderToString(createElement(PropertyCover,{title:'A6',source:'onbid',href:'/properties/test',region:'경기도 김포시 사우동',src:null}));
 expect(markup).toContain(encodeURIComponent('경기도 김포시 사우동'));
 expect(markup).not.toContain('푸른마을');
});
