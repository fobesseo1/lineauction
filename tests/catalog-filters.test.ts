import {expect,it} from 'vitest';
import {parseCatalogFilters,cardSchema} from '@/types/catalog';
import {getDemoProperties} from '@/lib/demo/data';
it('bounds page offsets and rejects invalid numeric filter input',()=>{
 const filters=parseCatalogFilters(new URLSearchParams('source=secret&offset=-500&maxBid=1e9&minFailed=-1&sort=injection'));
 expect(filters.source).toBe('court');expect(filters.offset).toBe(0);expect(filters.maxBid).toBe('');expect(filters.minFailed).toBe('');expect(filters.sort).toBe('recent');
 expect(parseCatalogFilters(new URLSearchParams('offset=999999999')).offset).toBe(1000000);
});
it('list payload excludes detailed data and raw observations',()=>{
 const card=cardSchema.parse({...getDemoProperties()[0],detail_payload:{secret:'private'},documents:['private']});
 expect(card).not.toHaveProperty('detail_payload');expect(card).not.toHaveProperty('documents');expect(card).not.toHaveProperty('latitude');expect(card).not.toHaveProperty('demo');
});
