const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('startup modules bypass older cache entries while actor preload and install share imports',()=>{
 const html=fs.readFileSync('city-explorer/index.html','utf8'),version=fs.readFileSync('shared/build-version.js','utf8').match(/const VERSION = '([^']+)'/)[1];
 const imports=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
 for(const [key,file]of [['./editor/override-runtime.js','./editor/override-runtime.js'],['./pumper-asset.js','./pumper-asset.js'],['./firefighter-asset.js?v=6','./firefighter-asset.js'],['./editor/generated-registry.js','./editor/generated-registry.js']])assert.equal(imports[key],file+'?v='+version+(key.includes('firefighter-asset')?'&actor=6':''));
 assert.equal(imports['./gameplay-systems.js?v=firefighter6'],'./gameplay-systems-1.6.69.js?v='+version+'&actor=6');
 assert.equal(imports['./gameplay-systems.js?v=firefighter4'],undefined);
 assert.equal(imports['./firefighter-asset.js?v=4'],undefined);
 assert.equal(imports['./editor/generated-registry.js?v=footage-20261020'],'./editor/generated-registry.js?v='+version+'&variant=footage');
 assert.ok(fs.readFileSync('city-explorer/app.js','utf8').includes("./progressive-city-build.mjs?v="+version));
 assert.match(fs.readFileSync('city-explorer/app.js','utf8'),/import\('\.\/pumper-asset\.js'\)/);
 assert.match(fs.readFileSync('city-explorer/gameplay-systems.js','utf8'),/import\('\.\/pumper-asset\.js'\)/);
 assert.match(fs.readFileSync('city-explorer/app.js','utf8'),/gameplay-systems\.js\?v=firefighter6/);
 assert.match(fs.readFileSync('city-explorer/app.js','utf8'),/firefighter-asset\.js\?v=6/);
 assert.match(fs.readFileSync('city-explorer/gameplay-systems.js','utf8'),/firefighter-asset\.js\?v=6/);
 assert.match(fs.readFileSync('city-explorer/firefighter-asset.js','utf8'),/firefighter-locomotion\.js\?v=6/);
});
