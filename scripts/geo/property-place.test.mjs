import test from 'node:test';
import assert from 'node:assert/strict';
import {lotOf,buildingName,roadOf,complexInAddress,pickPlace} from './property-place.mjs';

test('lotOf reads the lot after the 동 or 리',()=>{
 assert.deepEqual(lotOf('경기도 시흥시 정왕동 시화지구1868 주공아파트 203동 1층105호','정왕동'),{umd:'정왕동',main:'1868',sub:null});
 assert.deepEqual(lotOf('부산광역시 사하구 다대동 120-외 1필지 다대포현대아파트 104동 303호','다대동'),{umd:'다대동',main:'120',sub:null});
 assert.deepEqual(lotOf('부산광역시 북구 덕천동 573-3 409호','덕천동'),{umd:'덕천동',main:'573',sub:'3'});
 assert.deepEqual(lotOf('전라남도 광양시 광양읍 덕례리 1849 세미존서희스타힐스 103동',null),{umd:'덕례리',main:'1849',sub:null});
 assert.equal(lotOf('경기도 고양시 일산동구 식사동 식사2구역에이2 일산자이3차 205동','식사동'),null);
});
test('buildingName is the word before the 동 number, or the bracketed apartment',()=>{
 assert.equal(buildingName('경기도 고양시 일산동구 식사동 식사2구역에이2 일산자이3차 205동 10층1001호'),'일산자이3차');
 assert.equal(buildingName('충청남도 공주시 탄천면 송학로 78 102동 4층402호 (햇님아파트)'),'햇님아파트');
 assert.equal(buildingName('강원도 춘천시 아파트'),null);
});
test('roadOf finds a road address',()=>{
 assert.equal(roadOf('충청남도 공주시 탄천면 송학로 78 102동 4층402호 (햇님아파트)'),'충청남도 공주시 탄천면 송학로 78');
 assert.equal(roadOf('경기도 시흥시 정왕동 1868 주공아파트'),null);
});
test('complexInAddress needs the 시군구 and prefers the longest name',()=>{
 const cs=[{id:1,sido:'경기도',sigungu:'양평군',name:'아이파크아파트'},{id:2,sido:'경기도',sigungu:'고양시 일산서구',name:'일산아이파크1단지'},{id:3,sido:'부산광역시',sigungu:'동래구',name:'현대아파트'}];
 assert.equal(complexInAddress('경기도 고양시 일산서구 덕이동 1524 하이파크시티일산아이파크1단지 105동','경기도',cs).id,2);
 assert.equal(complexInAddress('경기도 평택시 동삭동 941 더샵지제역센트럴파크3블럭 308동','경기도',[{id:4,sido:'경기도',sigungu:'평택시',name:'더샵지제역센트럴파크3BL'}]).id,4);
 assert.equal(complexInAddress('부산광역시 사하구 다대동 120-외 1필지 다대포현대아파트 104동','부산광역시',cs),null);
});
test('pickPlace takes an apartment on the same lot, or of the same name',()=>{
 const items=[
  {title:'뜨란채2차아파트/미키어린이집',category:'비거주복지시설운영업',address:{parcel:'경기도 시흥시 정왕동 1868'},point:{x:'1',y:'2'}},
  {title:'시흥시화주공 2단지아파트',category:'시설구역경계 > 아파트단지',address:{parcel:'경기도 시흥시 정왕동 1868'},point:{x:'126.7',y:'37.3'}},
 ];
 assert.deepEqual(pickPlace(items,{sido:'경기도',lot:{umd:'정왕동',main:'1868'}}),{lat:37.3,lng:126.7});
 assert.equal(pickPlace(items,{sido:'경기도',lot:{umd:'정왕동',main:'186'}}),null);
 const named=[{title:'일산자이3차아파트/커뮤니티센터',category:'건물 > 제1종근린생활시설',address:{parcel:'경기도 고양시 일산동구 식사동 588-9'},point:{x:'126.8',y:'37.6'}}];
 assert.deepEqual(pickPlace(named,{sido:'경기도',name:'일산자이3차'}),{lat:37.6,lng:126.8});
 assert.equal(pickPlace(named,{sido:'경기도',name:'다른단지'}),null);
});
