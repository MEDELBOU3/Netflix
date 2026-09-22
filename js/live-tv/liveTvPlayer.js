let activeHls=null;
let activeVideo=null;

function destroyHls(){
  if(!activeHls)return;
  try{
    activeHls.stopLoad?.();
    activeHls.detachMedia?.();
    activeHls.destroy();
  }catch{}
  activeHls=null;
}

function safePlay(video){
  try{
    const p=video.play();
    if(p?.catch)p.catch(()=>{});
  }catch{}
}

export function stopHLS(video){
  destroyHls();
  const target=video||activeVideo;
  activeVideo=null;
  if(!target)return;
  try{
    target.pause();
    target.removeAttribute("src");
    target.removeAttribute("srcObject");
    target.load();
  }catch{}
}

export function playHLS(video,url,options={}){
  if(!video)throw new Error("Video element is required.");
  const source=String(url||"").trim();
  if(!source)throw new Error("Stream URL is empty.");

  stopHLS(video);
  activeVideo=video;
  video.autoplay=options.autoplay!==false;
  video.playsInline=true;
  video.controls=true;

  const nativeHls=
    video.canPlayType("application/vnd.apple.mpegurl") ||
    video.canPlayType("application/x-mpegURL");

  // Native HLS is the most reliable path where the browser supports it.
  if(nativeHls){
    video.src=source;
    video.addEventListener("loadedmetadata",()=>safePlay(video),{once:true});
    video.addEventListener("canplay",()=>safePlay(video),{once:true});
    video.load();
    return null;
  }

  if(!window.Hls||!window.Hls.isSupported()){
    throw new Error("hls.js is unavailable. This browser cannot play this HLS stream.");
  }

  const Hls=window.Hls;
  const hls=new Hls({
    enableWorker:true,
    lowLatencyMode:true,
    backBufferLength:30,
    liveSyncDurationCount:3,
    maxBufferLength:20,
    capLevelToPlayerSize:true,
    startFragPrefetch:true,
  });

  activeHls=hls;

  let manifestParsed=false;

  hls.on(Hls.Events.MEDIA_ATTACHED,()=>{
    if(activeHls!==hls)return;
    hls.loadSource(source);
  });

  hls.on(Hls.Events.MANIFEST_PARSED,()=>{
    if(activeHls!==hls)return;
    manifestParsed=true;
    options.onReady?.();
    safePlay(video);
  });

  hls.on(Hls.Events.ERROR,(_,data)=>{
    options.onError?.(data);
    if(!data?.fatal)return;

    if(data.type===Hls.ErrorTypes.NETWORK_ERROR){
      try{hls.startLoad();}catch{}
      return;
    }

    if(data.type===Hls.ErrorTypes.MEDIA_ERROR){
      try{hls.recoverMediaError();}catch{}
      return;
    }

    const detail=data.details||data.type||"unknown";
    try{
      hls.stopLoad();
      hls.detachMedia();
      hls.destroy();
    }catch{}
    if(activeHls===hls)activeHls=null;

    if(!manifestParsed){
      options.onUnsupported?.(detail);
    }
  });

  hls.attachMedia(video);
  return hls;
}

export function getActiveHls(){return activeHls;}
