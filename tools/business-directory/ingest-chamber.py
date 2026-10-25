"""Cache public Chamber category listings; keep only business facts in normalized output."""
import concurrent.futures,datetime,hashlib,json,re,urllib.request,urllib.parse
from pathlib import Path
from lxml import html
ROOT=Path(r'H:\ChatGPT\Peterborough-Building-References-20261024\business-signs')
BASE='https://web.pkchamber.ca'
def text(node):return ' '.join(node.itertext()).strip()
def parse(source,url,category):
 doc=html.fromstring(source)
 cards=doc.xpath('//*[contains(concat(" ",normalize-space(@class)," ")," ListingResults_All_CONTAINER ")]')
 lats=re.findall(r"listingLatitude\.push\('([^']*)'\)",source);lons=re.findall(r"listingLongitude\.push\('([^']*)'\)",source)
 output=[]
 for i,card in enumerate(cards):
  names=card.xpath('.//*[@itemprop="name"]');name=text(names[0]) if names else ''
  if not name:continue
  def prop(key):
   nodes=card.xpath('.//*[@itemprop="'+key+'"]');return text(nodes[0]) if nodes else ''
  city=prop('locality')
  if city.strip().lower()!='peterborough':continue
  links=names[0].xpath('.//a[@href]/@href');profile=urllib.parse.urljoin(BASE,links[0]) if links else url
  pid=re.search(r'-([0-9]+)$',urllib.parse.urlsplit(profile).path)
  lat=lon=None
  if len(lats)==len(lons)==len(cards):
   try:lat=float(lats[i]);lon=float(lons[i])
   except ValueError:pass
  output.append({'id':'chamber-directory:'+(pid.group(1) if pid else hashlib.sha256(profile.encode()).hexdigest()[:16]),'name':name,'address':prop('street-address'),'city':city,'lat':lat,'lon':lon,'category':category,'sourceKind':'chamber-directory','sourceUrl':profile,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()})
 return output

def fetch(category):
 url=urllib.parse.urljoin(BASE,category['href']);cache=ROOT/'chamber-pages'/ (hashlib.sha256(url.encode()).hexdigest()[:16]+'.html')
 try:
  if cache.exists():source=cache.read_text(encoding='utf-8')
  else:
   with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; PeterboroughMapGame/1.0)'}),timeout=35) as response:source=response.read().decode('utf-8')
   cache.parent.mkdir(parents=True,exist_ok=True);cache.write_text(source,encoding='utf-8')
  rows=parse(source,url,category['name']);return {'url':url,'records':rows,'error':None}
 except Exception as exc:return {'url':url,'records':[],'error':str(exc)}

def main():
 doc=html.fromstring((ROOT/'chamber-categories.html').read_text(encoding='utf-8'))
 links=doc.xpath('//li[contains(@class,"ListingCategories_AllCategories_CATEGORY")]//a[@href]')
 categories=[{'name':text(a),'href':a.get('href')} for a in links];records={};audit=[]
 print(json.dumps({'categories':len(categories)}),flush=True)
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  for index,result in enumerate(pool.map(fetch,categories),1):
   for row in result['records']:
    if row['id'] not in records:records[row['id']]=row
   audit.append({'url':result['url'],'records':len(result['records']),'error':result['error']})
   if index%10==0:print(json.dumps({'pages':index,'uniquePeterboroughRecords':len(records)}),flush=True)
 output={'source':BASE+'/allcategories','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'categories':len(categories),'categoryAudit':audit,'businesses':sorted(records.values(),key=lambda r:r['name'].lower())}
 (ROOT/'chamber-businesses-normalized.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'records':len(records),'pages':len(audit),'failedPages':sum(bool(a['error']) for a in audit)}),flush=True)
if __name__=='__main__':main()
