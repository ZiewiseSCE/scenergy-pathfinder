importScripts('turf-7.1.0.min.js','layout-core.js'+self.location.search);
self.onmessage=function(event){const input=event.data;const result=PFLayout.calculate(input,turf,progress=>self.postMessage({type:'progress',inputVersion:input.inputVersion,progress}));self.postMessage({type:'result',inputVersion:input.inputVersion,result});};
