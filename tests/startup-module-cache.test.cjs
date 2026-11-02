const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('startup modules bypass older cache entries while actor preload and install share imports',()=>{
 const html=fs.readFileSync('city-explorer/index.html','utf8'),version=fs.readFileSync('shared/build-version.js','utf8').match(/const VERSION = '([^']+)'/)[1];
 const imports=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
 for(const [key,file]of [['./editor/override-runtime.js','./editor/override-runtime.js'],['./pumper-asset.js','./pumper-asset.js'],['./firefighter-asset.js?v=4','./firefighter-asset.js'],['./editor/generated-registry.js','./editor/generated-registry.js']])assert.equal(imports[key],file+'?v='+version);
 assert.equal(imports['./editor/generated-registry.js?v=footage-20261020'],'./editor/generated-registry.js?v='+version+'&variant=footage');
 assert.match(fs.readFileSync('city-explorer/app.js','utf8'),/import\('\.\/pumper-asset\.js'\)/);
 assert.match(fs.readFileSync('city-explorer/gameplay-systems.js','utf8'),/import\('\.\/pumper-asset\.js'\)/);
});
