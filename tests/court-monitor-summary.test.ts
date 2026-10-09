import {expect,it} from 'vitest';
import {photoCollectionSummary} from '../lib/court-monitor-summary';
it('counts only scoped properties and unique photos without calling unvisited items failures',()=>{
 const media=[...Array.from({length:5},(_,n)=>({id:`a${n}`,key:'a'})),{id:'a0',key:'a'},{id:'b0',key:'b'},{id:'outside',key:'closed'}];
 const summary=photoCollectionSummary(['a','b','c','d'],{a:{state:'detail-saved',photos:5},b:{state:'detail-saved',photos:1},c:{state:'detail-disabled'}},media,null);
 expect(summary).toMatchObject({target:4,checked:3,remaining:1,fivePlus:1,multiple:1,one:1,noPhotos:2,totalPhotos:6,unavailable:1,errors:0,newPhotos:null});
});
it('distinguishes official absence from an actual failure',()=>{
 expect(photoCollectionSummary(['a','b'],{a:{state:'property-not-provided'},b:{state:'error'}},[],0)).toMatchObject({checked:2,remaining:0,unavailable:1,errors:1});
});
