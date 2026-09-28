/* Place discovery is independent of the viewport/layer filters and live analysis. */
(function(root){'use strict';
  function create(c){
    const {$,esc,request,choose}=c;
    let sequence=0,controller;
    const valid=p=>p&&typeof p.lat==='number'&&typeof p.lng==='number'&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&p.lat>=32&&p.lat<=39&&p.lng>=124&&p.lng<=132;
    function invalidate(clear=false){
      sequence++;controller?.abort();$('search').removeAttribute('aria-busy');$('searchSubmit').textContent='검색';
      if(clear){$('searchResults').innerHTML='';$('searchStatus').textContent='주소·사업장·시설을 전국에서 찾습니다.';}
    }
    function select(p,button){
      if(!valid(p)){$('searchStatus').textContent='좌표를 확인하지 못했습니다. 정확한 주소로 다시 검색해 주세요.';return;}
      invalidate();
      $('searchResults').querySelectorAll('[data-place]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      $('searchStatus').textContent='선택 위치로 이동했습니다. 주변 저장 자료를 확인하거나 관심 현장에 저장하세요.';
      choose(p);
    }
    async function search(){
      invalidate(true);const q=$('query').value.trim();
      if(q.length<2){$('searchStatus').textContent='주소나 사업장 이름을 두 글자 이상 입력해 주세요.';$('query').focus();return;}
      const current=sequence;controller=new AbortController();const activeController=controller,signal=controller.signal;
      let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;activeController.abort();},20000);
      $('search').setAttribute('aria-busy','true');$('searchSubmit').textContent='찾는 중';$('searchStatus').textContent='전국 저장 시설과 주소·장소를 찾는 중…';
      try{
        const j=await request('/search?q='+encodeURIComponent(q),{signal});
        if(current!==sequence)return;
        const all=j.items||[],items=all.filter(valid),invalid=items.length!==all.length;
        if(!items.length){$('searchStatus').textContent=j.warning||(invalid?'검색 결과의 좌표를 확인하지 못했습니다. 도로명·지번 주소로 다시 검색해 주세요.':'검색 결과가 없습니다. 시·군·구를 붙이거나 도로명·지번 주소로 다시 검색해 주세요.');return;}
        $('searchResults').innerHTML=items.map((p,i)=>`<button type="button" class="place-result" data-place="${i}" aria-pressed="false"><span>${esc(p.searchSource==='stored'?'저장 시설 · '+(c.kindLabel[p.kind]||'현장'):'주소·장소')}</span><strong>${esc(p.name||p.address)}</strong><small>${esc(p.address||'주소 미등록 · 지도에서 위치 확인')}${p.roadAddress&&p.roadAddress!==p.address?'<br>도로명: '+esc(p.roadAddress):''}</small></button>`).join('');
        const buttons=$('searchResults').querySelectorAll('[data-place]');
        buttons.forEach(b=>b.onclick=()=>select(items[Number(b.dataset.place)],b));
        if(items.length===1&&!j.truncated&&!j.warning&&!invalid){select(items[0],buttons[0]);return;}
        $('searchStatus').textContent=`${items.length}개 후보 · 주소를 보고 선택하면 지도가 이동합니다.`+(j.truncated?' 더 많은 결과가 있습니다. 지역·주소를 덧붙여 좁혀 주세요.':'')+(j.warning?' '+j.warning:'')+(invalid?' 일부 결과는 좌표를 확인하지 못했습니다.':'');
      }catch(e){if(current!==sequence)return;$('searchStatus').textContent=timedOut?'좌표 검색 응답이 지연됩니다. 잠시 후 다시 검색해 주세요.':'검색하지 못했습니다. '+(e.message||'연결을 확인하고 다시 시도해 주세요.');}
      finally{clearTimeout(timeout);if(current===sequence){$('search').removeAttribute('aria-busy');$('searchSubmit').textContent='검색';}}
    }
    $('search').onsubmit=e=>{e.preventDefault();search();};
    $('query').oninput=()=>invalidate(true);
    return {search,invalidate};
  }
  root.PFExploreSearch={create};
})(typeof window==='undefined'?module.exports:window);
