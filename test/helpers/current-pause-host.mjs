// Supply only absent process-lifetime owners for isolated main-function VMs.
// Never replace a live scene, clock, focus function or audio double under test.
export function fillCurrentPauseHost(host){
  const noop=()=>{},defaults={
    runPlayDurationClock:{suspend:noop},FEAR:{setHeartbeatPaused:noop},
    b3SpeakerAudio:{pause:noop},b3Speaker:{flush:noop},
    firstStrikeScene:null,firstStrikeAudio:null,sourceRecordingInspectionScene:null,
    openingVehicleScene:null,openingArrivalAudio:null,openingCabRadio:null,openingOvertureScene:null,studentStrikeScene:null,
    sourceRestBreath:null,sourceRestWeather:null,pubPressureAudio:null,bodyGain:null,
    gameplayInputLifecycleActive:()=>true,
  };
  for(const[key,value]of Object.entries(defaults))if(!(key in host))host[key]=value;
  host.STORY??={};
  for(const key of['pauseOpeningOvertureScore','resumeOpeningOvertureScore'])if(!(key in host.STORY))host.STORY[key]=noop;
  return host;
}
