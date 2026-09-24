/* Shared VWorld cadastral rendering for exploration and the design studio. */
(function(){'use strict';
  const Cadastral=L.TileLayer.WMS.extend({
    getTileUrl(coords){
      // VWorld's parcel style is blank below its detailed source scale.
      // Request a denser image at neighbourhood zooms without multiplying tiles.
      const size=256*2**Math.max(0,18-coords.z);
      this.wmsParams.width=size;this.wmsParams.height=size;
      return L.TileLayer.WMS.prototype.getTileUrl.call(this,coords);
    }
  });
  window.PFMapLayers={
    cadastralMinZoom:16,
    cadastral(key,domain){
      return new Cadastral('https://api.vworld.kr/req/wms',{
        layers:'lp_pa_cbnd_bubun',styles:'lp_pa_cbnd_bubun_line',
        format:'image/png',transparent:true,version:'1.3.0',key,domain,
        minZoom:16,maxZoom:21,maxNativeZoom:19,tileSize:256,
        updateWhenIdle:true,updateWhenZooming:false,keepBuffer:0,
        bounds:[[31.5,123],[39.5,133]],noWrap:true,
        opacity:.85,zIndex:3,className:'pf-cadastral-tile'
      });
    }
  };
})();
