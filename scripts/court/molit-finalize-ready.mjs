export function molitFinalizeReady({audit,photos,staged,collectorActive,pipelineActive}){
 return !collectorActive&&!pipelineActive&&audit?.collectionComplete===true&&audit?.counts?.verified===6383&&photos?.status==='completed'&&!photos.errors?.length&&staged?.status==='staged';
}
