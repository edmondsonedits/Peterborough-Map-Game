"""Cache public DBIA/ptbo.ca directory facts; raw pages never enter game assets."""
import argparse,concurrent.futures,datetime,hashlib,json,re,time,urllib.parse,urllib.request,urllib.error
from pathlib import Path
from lxml import html
ROOT=Path(r'H:\ChatGPT\Peterborough-Building-References-20261024\business-signs')
SITES={'boro':('https://theboro.ca','https://theboro.ca/directory/'),'ptbo':('https://ptbo.ca','https://ptbo.ca/discover')}
SUFFIX=r'(?:Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Court|Ct\.?|Way|Place|Pl\.?|Square|Sq\.?|Crescent|Cres\.?|Highway|Hwy\.?|Parkway|Pkwy\.?|Terrace|Trail)'
ADDRESS=re.compile(r'\b\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?\s+[A-Za-z0-9.\u2019\x27# -]{2,80}?\b'+SUFFIX+r'\b(?:\s+(?:North|South|East|West|N|S|E|W)\b)?(?:\s*,?\s*(?:Unit|Suite|#)\s*[\w-]+)?',re.I)
PAIR=re.compile(r'\s*([+-]?\d{1,2}(?:\.\d+)?)\s*,\s*([+-]?\d{1,3}(?:\.\d+)?)\s*')
def text(node):return ' '.join(' '.join(node.itertext()).split())
def fetch(site,url,kind,key):
 cache=ROOT/(site+'-'+kind+'-'+hashlib.sha256(key.encode()).hexdigest()[:16]+'.html')
 if cache.exists():return cache.read_text(encoding='utf-8')
 req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; PeterboroughMapGame/1.0)','Accept':'text/html'})
 for attempt in range(3):
  try:
   with urllib.request.urlopen(req,timeout=35) as response:
    if 'text/html' not in response.headers.get('Content-Type',''):raise RuntimeError('Expected public HTML')
    body=response.read(5000001)
    if len(body)>5000000:raise RuntimeError('Public page exceeded bounded size')
   break
  except (urllib.error.URLError,TimeoutError) as error:
   if isinstance(error,urllib.error.HTTPError) and error.code<500 and error.code!=429:raise
   if attempt==2:raise
   time.sleep(.5*(attempt+1))
 source=body.decode('utf-8','replace');source=re.sub(r'([?&](?:api[_-]?key|apikey|key)=)[^&\"\x27\s<>]+',r'\1[REDACTED]',source,flags=re.I);cache.write_text(source,encoding='utf-8');return source

def profiles(site,source):
 base=SITES[site][0];doc=html.fromstring(source);result={}
 links=doc.xpath('//h3//a[@href] | //h2//a[@href] | //a[@href][.//h3 or .//h2]')
 for a in links:
  url=urllib.parse.urljoin(base,a.get('href'));parts=urllib.parse.urlsplit(url)
  if parts.netloc!=urllib.parse.urlsplit(base).netloc:continue
  pattern=r'/directory/([^/]+)/?' if site=='boro' else r'/([A-Za-z0-9][A-Za-z0-9_-]{0,100})/?'
  match=re.fullmatch(pattern,parts.path)
  if not match:continue
  headings=a.xpath('.//h2 | .//h3');name=text(headings[0] if headings else a)
  if not name or match[1] in ['discover','about','contact','events','privacy','terms','join','login','register']:continue
  result[match[1]]={'id':site+'-directory:'+match[1],'name':name,'sourceUrl':urllib.parse.urlunsplit((parts.scheme,parts.netloc,parts.path,'',''))}
 return result

def profile(site,row):
 try:
  source=fetch(site,row['sourceUrl'],'profile',row['sourceUrl']);doc=html.fromstring(source);head=doc.xpath('//main//h1 | //article//h1 | //h1');name=text(head[0]) if head else row['name'];address='';coordinates=None;city=None
  # Prefer explicitly marked address nodes and public directions links.
  preferred=doc.xpath('//address | //*[@itemprop="streetAddress"] | //a[contains(@href,"google") and contains(@href,"maps")]')
  fallback=doc.xpath('//p | //span')
  for nodes in [preferred,fallback]:
   candidates=[]
   for node in nodes:
    value=text(node)
    if len(value)>230:continue
    match=ADDRESS.search(value)
    if match and (node in preferred or value[:1].isdigit()):candidates.append(match[0].strip(' ,.;'))
   unique=list(dict.fromkeys(candidates))
   if len(unique)==1:address=unique[0];break
  if not address and site=='boro':
   visible=' '.join(doc.xpath('//body//text()[not(ancestor::script) and not(ancestor::style)]'));matches=[m.group(0).strip(' ,.;') for m in ADDRESS.finditer(visible) if re.match(r'\s*,\s*Peterborough\s*,\s*ON\b',visible[m.end():],re.I)]
   if len(set(matches))==1:address=matches[0]
  for url in doc.xpath('//iframe/@src | //a/@href'):
   if 'google' not in url or 'maps' not in url:continue
   query=urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
   for key in ['q','query','destination']:
    for value in query.get(key,[]):
     match=PAIR.fullmatch(value)
     if match:
      lat,lon=map(float,match.groups())
      if -90<=lat<=90 and -180<=lon<=180:coordinates=(lat,lon)
     elif not address:
      match=ADDRESS.search(value)
      if match:address=match[0].strip(' ,.;')
  # Public JSON-LD is the site's explicit business/location metadata.
  for raw in doc.xpath('//script[@type="application/ld+json"]/text()'):
   try:payload=json.loads(raw)
   except ValueError:continue
   items=payload if isinstance(payload,list) else payload.get('@graph',[payload])
   for item in items:
    if not isinstance(item,dict) or str(item.get('url','')).rstrip('/')!=row['sourceUrl'].rstrip('/'):continue
    postal=item.get('address');geo=item.get('geo')
    if isinstance(postal,dict):
     city=postal.get('addressLocality');published=postal.get('streetAddress','')
     if ADDRESS.search(published):address=published if not city or city.lower() in published.lower() else published+', '+city
    if isinstance(geo,dict):
     try:lat,lon=float(geo['latitude']),float(geo['longitude'])
     except (KeyError,TypeError,ValueError):continue
     if -90<=lat<=90 and -180<=lon<=180:coordinates=(lat,lon)
  if site=='boro':
   explicit=doc.xpath('//p[contains(concat(" ",normalize-space(@class)," ")," business-address ")]')
   if len(explicit)==1 and ADDRESS.search(text(explicit[0])):address=text(explicit[0]);city='Peterborough' if 'Peterborough' in address else None
  output={**row,'name':name,'address':address,'sourceKind':site+'-directory','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
  if city:output['city']=city
  if coordinates:output.update(lat=coordinates[0],lon=coordinates[1])
  return output
 except Exception as error:return {**row,'address':'','sourceKind':site+'-directory','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'ingestError':str(error)}

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--site',choices=['boro','ptbo','both'],default='both');parser.add_argument('--probe',action='store_true');args=parser.parse_args();ROOT.mkdir(parents=True,exist_ok=True)
 for site in SITES if args.site=='both' else [args.site]:
  listings={};pages=0;terminated=False;advertised=None
  for page in range(1,101):
   base,directory=SITES[site];url=directory if page==1 else directory+('?_business_listing_pagination=' if site=='boro' else '?page=')+str(page)
   source=fetch(site,url,'page',url);rows=profiles(site,source);new=set(rows)-set(listings);pages=page
   count=re.search(r'([0-9,]+)\s+businesses listed',html.fromstring(source).text_content(),re.I)
   if count:advertised=int(count[1].replace(',',''))
   if not new:terminated=True;break
   listings.update(rows)
   if len(listings)>1000:raise RuntimeError('Directory exceeded bounded profile scope')
   if args.probe:break
  if not listings:raise RuntimeError(site+' returned no profile cards')
  if not args.probe and not terminated:raise RuntimeError(site+' pagination did not terminate within scope')
  print(json.dumps({'site':site,'pages':pages,'profiles':len(listings),'advertised':advertised,'probe':args.probe}),flush=True)
  selected=list(listings.values())[:2] if args.probe else list(listings.values());businesses=[]
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
   for index,row in enumerate(pool.map(lambda r:profile(site,r),selected),1):
    businesses.append(row)
    if index%50==0:print(json.dumps({'site':site,'processedProfiles':index}),flush=True)
  if args.probe:print(json.dumps(businesses,ensure_ascii=True),flush=True);continue
  errors=sum(bool(row.get('ingestError')) for row in businesses);output={'sourceUrl':directory,'sourceKind':site+'-directory','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'pages':pages,'advertisedBusinesses':advertised,'paginationTerminated':terminated,'profileErrors':errors,'businesses':businesses}
  target=ROOT/(site+'-businesses-normalized.json');temp=target.with_suffix('.json.tmp');temp.write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(target)
  print(json.dumps({'site':site,'records':len(businesses),'addresses':sum(bool(r['address']) for r in businesses),'coordinates':sum('lat' in r for r in businesses),'profileErrors':errors}),flush=True)
if __name__=='__main__':main()
