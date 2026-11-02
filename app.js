const $=id=>document.getElementById(id);
const tabs=[...document.querySelectorAll('.tab')];
tabs.forEach(b=>b.addEventListener('click',()=>{tabs.forEach(x=>x.classList.remove('active'));b.classList.add('active');['text','image','projects'].forEach(id=>$(id).classList.toggle('hidden',id!==b.dataset.tab));}));
const api=()=>((window.VIDEoCRAFT_CONFIG||{}).API_BASE_URL||'').replace(/\/$/,'');
const presets={
 kids:"A cheerful polished 3D children's animation, cute friendly characters, colorful garden playground, soft sunny lighting, smooth playful movement, consistent character design, cinematic camera movement, vibrant child-friendly colors, no on-screen text.",
 cinematic:"Ultra cinematic realistic scene, natural detailed textures, atmospheric lighting, smooth dolly camera movement, professional composition, realistic motion, film-quality color grading.",
 product:"Premium commercial product showcase, clean studio background, elegant softbox lighting, slow rotating camera movement, crisp product details, luxury advertising style.",
 nature:"Beautiful natural landscape, golden-hour sunlight, lush detailed environment, gentle wind and flowing motion, cinematic wide camera movement, peaceful atmosphere."
};
$('preset').addEventListener('change',()=>{const v=presets[$('preset').value];if(v){$('prompt').value=v+' ';$('prompt').focus()}});
function saved(){try{return JSON.parse(localStorage.getItem('vc_projects')||'[]')}catch{return []}}
function save(items){localStorage.setItem('vc_projects',JSON.stringify(items));renderProjects()}
function addProject(p){const a=saved();a.unshift({...p,created:new Date().toLocaleString()});save(a.slice(0,30));return a[0]}
function updateProject(jobId,patch){save(saved().map(p=>p.job_id===jobId?{...p,...patch}:p))}
function renderProjects(){
 $('projectList').innerHTML='';
 saved().forEach(p=>{
  const d=document.createElement('div');d.className='project';
  const t=document.createElement('p');t.textContent=p.prompt||'Untitled project';
  const s=document.createElement('small');s.textContent=(p.mode||'Text')+' • '+p.created+' • '+(p.status||'Saved');
  d.append(t,s);
  if(p.video_url){const a=document.createElement('a');a.href=p.video_url.startsWith('http')?p.video_url:api()+p.video_url;a.target='_blank';a.rel='noopener';a.textContent='Open / Download video';a.style.display='block';a.style.marginTop='8px';d.append(a)}
  $('projectList').append(d)
 });
 if(!saved().length)$('projectList').textContent='अभी कोई project सेव नहीं है।';
}

const HF_SPACE='DeepRat/LTX-Video-ZeroGPU-Optimized';
let gradioClientPromise;
async function getGradioClient(){
 if(!gradioClientPromise){
  gradioClientPromise=(async()=>{
   const lib=await import('https://cdn.jsdelivr.net/npm/@gradio/client/dist/index.min.js');
   const client=await lib.Client.connect(HF_SPACE);
   return {client,handle_file:lib.handle_file};
  })();
 }
 return gradioClientPromise;
}
function extractVideoUrl(result){
 const item=result?.data?.[0];

 // Gradio Video output is commonly returned as:
 // { video: { path: "...", url: "https://..." }, subtitles: null }
 const candidates=[
  item?.video?.url,
  item?.video,
  item?.url,
  item?.path,
  item?.name,
  item
 ];

 for(const candidate of candidates){
  if(typeof candidate==='string' && /^https?:\/\//i.test(candidate))return candidate;
  if(candidate && typeof candidate==='object'){
   if(typeof candidate.url==='string' && /^https?:\/\//i.test(candidate.url))return candidate.url;
   if(typeof candidate.path==='string' && /^https?:\/\//i.test(candidate.path))return candidate.path;
  }
 }

 // Include the returned shape in the diagnostic, without exposing file contents.
 const shape=item && typeof item==='object'
  ? Object.keys(item).join(', ')
  : typeof item;
 const videoShape=item?.video && typeof item.video==='object'
  ? Object.keys(item.video).join(', ')
  : typeof item?.video;
 throw new Error('Video output मिला, लेकिन playable URL नहीं मिला। Output keys: '+shape+'; video keys: '+videoShape+'.');
}
async function directGenerate(payload,file){
 showStatus('Hugging Face Space से कनेक्ट हो रहा है…','Connecting');
 try{
  const {client,handle_file}=await getGradioClient();
  showStatus('GPU queue में request भेजी जा रही है…','Queued');
  const prompt=payload.prompt;
  const negative=payload.negative_prompt||'worst quality, inconsistent motion, blurry, jittery, distorted';
  const ratioDims={'16:9':[384,672],'9:16':[672,384],'1:1':[512,512]};
  const [height,width]=ratioDims[payload.aspect_ratio]||[384,672];
  const duration=Math.max(1,Math.min(Number(payload.duration)||2,8));
  const args=file
   ? [prompt,negative,handle_file(file),null,height,width,'image-to-video',duration,9,42,true,3.0,false,false]
   : [prompt,negative,null,null,height,width,'text-to-video',duration,9,42,true,3.0,false,false];
  showStatus('AI model वीडियो बना रहा है। GPU queue के कारण समय लग सकता है…','Generating');
  const result=await client.predict(file?'/image_to_video':'/text_to_video',args);
  const videoUrl=extractVideoUrl(result);
  const localId='direct-'+Date.now();
  const url=videoUrl;
  $('outputVideo').src=url;$('outputVideo').classList.remove('hidden');
  $('download').href=url;$('download').classList.remove('hidden');
  $('download').download='videocraft-ai.mp4';
  addProject({job_id:localId,mode:payload.mode,prompt:payload.prompt,status:'Completed',video_url:url});
  showStatus('AI वीडियो तैयार है।','Completed');
 }catch(e){
  showStatus('Generation नहीं हो पाई: '+(e?.message||String(e)),'Error');
 }
}

$('clearProjects').onclick=()=>{if(confirm('सभी saved projects हटाएँ?'))save([])};
$('sourceImage').onchange=()=>{$('imageName').textContent=$('sourceImage').files[0]?.name||''};
function showStatus(msg,status='Working'){$('result').classList.remove('hidden');$('statusText').textContent=msg;$('status').textContent=status;$('outputVideo').classList.add('hidden');$('download').classList.add('hidden')}
$('checkConnection').onclick=async()=>{
 $('connectionStatus').textContent='GPU Space connection जाँचा जा रहा है…';
 try{
  if(api()){const r=await fetch(api()+'/api/health');if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json();$('connectionStatus').textContent='Backend online: '+(d.provider||'VideoCraft API')}
  else{await getGradioClient();$('connectionStatus').textContent='Hugging Face GPU Space से connection बन गया। Generate request पर quota/queue लागू होगी.'}
 }catch(e){$('connectionStatus').textContent='Connection नहीं हुआ: '+e.message}
};
async function submitJob(payload,file){
 showStatus('Backend से संपर्क किया जा रहा है…');
 if(!api()){directGenerate(payload,file);return}
 try{
  let res;
  if(file){const fd=new FormData();Object.entries(payload).forEach(([k,v])=>fd.append(k,v));fd.append('image',file);res=await fetch(api()+'/api/generate/image',{method:'POST',body:fd})}
  else{res=await fetch(api()+'/api/generate/text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})}
  const data=await res.json();if(!res.ok)throw new Error(data.detail||'Generation request failed');
  addProject({job_id:data.job_id,mode:payload.mode,prompt:payload.prompt,status:'Queued'});
  poll(data.job_id)
 }catch(e){showStatus(e.message,'Error')}
}
async function poll(id){
 for(let i=0;i<150;i++){
  await new Promise(r=>setTimeout(r,4000));
  try{
   const r=await fetch(api()+'/api/jobs/'+encodeURIComponent(id));const d=await r.json();
   showStatus(d.message||d.status,d.status);
   if(d.status==='completed'&&d.video_url){
    const url=d.video_url.startsWith('http')?d.video_url:api()+d.video_url;
    $('outputVideo').src=url;$('outputVideo').classList.remove('hidden');$('download').href=url;$('download').classList.remove('hidden');
    updateProject(id,{status:'Completed',video_url:d.video_url});return
   }
   if(d.status==='failed'){updateProject(id,{status:'Failed'});return}
  }catch(e){showStatus('Status check में समस्या: '+e.message,'Error');return}
 }
 showStatus('अभी processing चल रही हो सकती है। कुछ देर बाद My Projects में जाँचें।','Still working')
}
$('generateText').onclick=()=>{
 const prompt=$('prompt').value.trim();if(!prompt){alert('पहले video idea लिखो।');return}
 submitJob({mode:'text',prompt,negative_prompt:$('negativePrompt').value.trim(),aspect_ratio:$('ratio').value,duration:$('duration').value,style:$('style').value})
};
$('generateImage').onclick=()=>{
 const prompt=$('imagePrompt').value.trim(),file=$('sourceImage').files[0];if(!prompt||!file){alert('Image और motion prompt दोनों चुनो।');return}
 submitJob({mode:'image',prompt,negative_prompt:$('imageNegativePrompt').value.trim(),aspect_ratio:$('imageRatio').value,duration:$('imageDuration').value},file)
};
renderProjects();if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});

   ? [prompt,negative,handle_file(file),null,height,width,'image-to-video',duration,9,42,true,3.0,false,false]
   : [prompt,negative,null,null,height,width,'text-to-video',duration,9,42,true,3.0,false,false];
  showStatus('AI model वीडियो बना रहा है। GPU queue के कारण समय लग सकता है…','Generating');
  const result=await client.predict(file?'/image_to_video':'/text_to_video',args);
  const videoUrl=extractVideoUrl(result);
  const localId='direct-'+Date.now();
  const url=videoUrl;
  $('outputVideo').src=url;$('outputVideo').classList.remove('hidden');
  $('download').href=url;$('download').classList.remove('hidden');
  $('download').download='videocraft-ai.mp4';
  addProject({job_id:localId,mode:payload.mode,prompt:payload.prompt,status:'Completed',video_url:url});
  showStatus('AI वीडियो तैयार है।','Completed');
 }catch(e){
  showStatus('Generation नहीं हो पाई: '+(e?.message||String(e)),'Error');
 }
}

$('clearProjects').onclick=()=>{if(confirm('सभी saved projects हटाएँ?'))save([])};
$('sourceImage').onchange=()=>{$('imageName').textContent=$('sourceImage').files[0]?.name||''};
function showStatus(msg,status='Working'){$('result').classList.remove('hidden');$('statusText').textContent=msg;$('status').textContent=status;$('outputVideo').classList.add('hidden');$('download').classList.add('hidden')}
$('checkConnection').onclick=async()=>{
 $('connectionStatus').textContent='GPU Space connection जाँचा जा रहा है…';
 try{
  if(api()){const r=await fetch(api()+'/api/health');if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json();$('connectionStatus').textContent='Backend online: '+(d.provider||'VideoCraft API')}
  else{await getGradioClient();$('connectionStatus').textContent='Hugging Face GPU Space से connection बन गया। Generate request पर quota/queue लागू होगी.'}
 }catch(e){$('connectionStatus').textContent='Connection नहीं हुआ: '+e.message}
};
async function submitJob(payload,file){
 showStatus('Backend से संपर्क किया जा रहा है…');
 if(!api()){directGenerate(payload,file);return}
 try{
  let res;
  if(file){const fd=new FormData();Object.entries(payload).forEach(([k,v])=>fd.append(k,v));fd.append('image',file);res=await fetch(api()+'/api/generate/image',{method:'POST',body:fd})}
  else{res=await fetch(api()+'/api/generate/text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})}
  const data=await res.json();if(!res.ok)throw new Error(data.detail||'Generation request failed');
  addProject({job_id:data.job_id,mode:payload.mode,prompt:payload.prompt,status:'Queued'});
  poll(data.job_id)
 }catch(e){showStatus(e.message,'Error')}
}
async function poll(id){
 for(let i=0;i<150;i++){
  await new Promise(r=>setTimeout(r,4000));
  try{
   const r=await fetch(api()+'/api/jobs/'+encodeURIComponent(id));const d=await r.json();
   showStatus(d.message||d.status,d.status);
   if(d.status==='completed'&&d.video_url){
    const url=d.video_url.startsWith('http')?d.video_url:api()+d.video_url;
    $('outputVideo').src=url;$('outputVideo').classList.remove('hidden');$('download').href=url;$('download').classList.remove('hidden');
    updateProject(id,{status:'Completed',video_url:d.video_url});return
   }
   if(d.status==='failed'){updateProject(id,{status:'Failed'});return}
  }catch(e){showStatus('Status check में समस्या: '+e.message,'Error');return}
 }
 showStatus('अभी processing चल रही हो सकती है। कुछ देर बाद My Projects में जाँचें।','Still working')
}
$('generateText').onclick=()=>{
 const prompt=$('prompt').value.trim();if(!prompt){alert('पहले video idea लिखो।');return}
 submitJob({mode:'text',prompt,negative_prompt:$('negativePrompt').value.trim(),aspect_ratio:$('ratio').value,duration:$('duration').value,style:$('style').value})
};
$('generateImage').onclick=()=>{
 const prompt=$('imagePrompt').value.trim(),file=$('sourceImage').files[0];if(!prompt||!file){alert('Image और motion prompt दोनों चुनो।');return}
 submitJob({mode:'image',prompt,negative_prompt:$('imageNegativePrompt').value.trim(),aspect_ratio:$('imageRatio').value,duration:$('imageDuration').value},file)
};
renderProjects();if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
