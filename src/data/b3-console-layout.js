// Reference-led 1985 small-studio desk, adapted to B3's existing furniture.
// Measurements below author THIS model, not a factory-dimensional replica.
export const B3_CONSOLE_REFERENCE=Object.freeze({
  maker:'Soundcraft',model:'Series 600',year:1985,displayName:'SERIES 600 / 16',
  description:'1985 eight-group, sixteen-track split-monitor recording console',
  manualUrl:'https://helpwiki.evergreen.edu/wiki/images/7/7c/Soundcraft-500-600-User-Manual.pdf',
  channelDiagramUrl:'https://helpwiki.evergreen.edu/wiki/images/0/03/Soundcraft600-channel-diagram.pdf',
  datedAnnouncementUrl:'https://www.worldradiohistory.com/Archive-All-Audio/Archive-Studio-Sound/80s/Studio-Sound-1985-02.pdf',
  datedManufacturerAdUrl:'https://www.worldradiohistory.com/Archive-All-Audio/Mix-Magazine/80s/85/Mix-1985-10a.pdf',
  notes:'The documented 1985 console supplies the input/group/monitor topology, knob hierarchy, sixteen bar meters and twin stereo VUs. Existing B3 furniture width and larger controls remain gameplay adaptations. No manufacturer textures, logos or drawings are embedded.',
});
export const B3_CONSOLE_LAYOUT=Object.freeze({
  channels:16,groupCount:8,monitorCount:16,auxBuses:6,
  channelNames:Object.freeze(['VOICE','ROOM','RETURN','TALK',...Array.from({length:12},(_,i)=>`LINE ${i+5}`)]),
  groupCapColors:Object.freeze(['ivory','ivory','ivory','ivory','blue','blue','blue','blue']),
  width:2.30,depth:.96,channelStartX:-.985,channelPitch:.061,
  faderTrack:.10,workingFaderZ:.245,faderHeight:.918,workingValue:.75,
  trackCentreZ:.27,trackSurfaceY:.901,
  groupStartX:.12,groupPitch:.072,masterXs:Object.freeze([.82,.99]),
  eqRows:Object.freeze([-.245,-.199,-.153,-.107,-.061]),
  auxRows:Object.freeze([-.012,.027,.066,.105]),
  gainZ:-.302,panZ:.155,
  knobColors:Object.freeze({gain:'red',eq:'blue',frequency:'green',aux:'ivory',pan:'blue'}),
  finish:Object.freeze({panel:'#52585c',channel:'#53595d',group:'#444c51',master:'#3a454b',wood:'#69513b',armrest:'#171b1c',ivory:'#d1cdb9',red:'#aa4939',blue:'#527d91',green:'#79928a'}),
});
export const b3ConsoleChannelX=index=>B3_CONSOLE_LAYOUT.channelStartX+index*B3_CONSOLE_LAYOUT.channelPitch;
export const b3ConsoleFaderZ=value=>B3_CONSOLE_LAYOUT.workingFaderZ+B3_CONSOLE_LAYOUT.faderTrack*(B3_CONSOLE_LAYOUT.workingValue-Math.max(0,Math.min(1,Number(value)||0)));

export const b3ConsoleUpperSurfaceY=z=>.95+.05/Math.cos(.28)-Math.tan(.28)*(z+.10);
