import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PropertyCover} from '@/components/property/property-cover';
import {DetailPreviewHeader} from '@/components/property/detail-preview-header';
it('serves small court WebP originals directly in cards and detail headers',()=>{
 const path='/media/court/example.webp';
 for(const element of [createElement(PropertyCover,{src:path,title:'사진',source:'court',href:'/properties/test'}),createElement(DetailPreviewHeader,{photo:path,title:'사진',children:'상세'})]){
  const html=renderToStaticMarkup(element);
  expect(html).toContain(`src="${path}"`);
  expect(html).not.toContain('/_next/image');
 }
});
