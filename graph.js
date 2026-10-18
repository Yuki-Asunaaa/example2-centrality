/* 交互绘图：只接收结果，不计算中心性或读取文件。 */
export class NetworkView {
  constructor(svgElement,onSelect){
    this.el=svgElement;this.svg=d3.select(svgElement);this.onSelect=onSelect;
    this.root=this.svg.append('g');this.linkLayer=this.root.append('g');this.nodeLayer=this.root.append('g');this.labelLayer=this.root.append('g');
    this.scale=1;this.zoom=d3.zoom().scaleExtent([.15,5]).on('zoom',event=>{this.scale=event.transform.k;this.root.attr('transform',event.transform);this.applyZoomStyles();});
    this.svg.call(this.zoom).on('dblclick.zoom',null).on('click',event=>{if(event.target===this.el)this.onSelect(null)});
    this.resize=new ResizeObserver(()=>{this.measure();if(this.nodes)this.fit();});
    this.resize.observe(this.el);this.measure();this.paused=false;
  }
  measure(){this.width=this.el.clientWidth||700;this.height=this.el.clientHeight||510;this.svg.attr('viewBox',`0 0 ${this.width} ${this.height}`)}
  setData(data){
    if(this.sim)this.sim.stop();
    this.metricTimer?.stop();
    this.metricAnimating=false;
    this.labelLayer.attr('opacity',1);
    this.nodes=data.nodes.map(n=>({...n}));this.links=data.links.map(l=>({...l}));
    this.lines=this.linkLayer.selectAll('line').data(this.links).join('line').attr('stroke','#7896bc').attr('stroke-width',.8).attr('vector-effect','non-scaling-stroke');
    this.circles=this.nodeLayer.selectAll('circle').data(this.nodes,n=>n.id).join('circle').attr('class','graph-node').attr('vector-effect','non-scaling-stroke').attr('stroke','#fff').attr('stroke-width',1.2).attr('r',5)
      .on('click',(event,n)=>{event.stopPropagation();this.onSelect(n.id)})
      .call(d3.drag().on('start',(event,n)=>{if(!event.active&&!this.paused)this.sim.alphaTarget(.15).restart();n.fx=n.x;n.fy=n.y;})
      .on('drag',(event,n)=>{n.fx=event.x;n.fy=event.y;if(this.paused){n.x=event.x;n.y=event.y;this.tick()}})
      .on('end',(event,n)=>{if(!event.active)this.sim.alphaTarget(0);n.fx=null;n.fy=null}));
    this.circles.selectAll('title').data(n=>[n]).join('title').text(n=>`节点 ${n.id} · ${n.type}`);
    this.sim=d3.forceSimulation(this.nodes).force('link',d3.forceLink(this.links).id(n=>n.id).distance(36).strength(.4))
      .force('charge',d3.forceManyBody().strength(-38)).force('collision',d3.forceCollide(12).iterations(2))
      .force('center',d3.forceCenter(this.width/2,this.height/2)).on('tick',()=>this.tick());
    this.sim.stop();this.sim.tick(210);this.tick();this.fit();
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches&&!this.paused)this.sim.alpha(.04).restart();
  }
  tick(){
    this.lines.attr('x1',l=>l.source.x).attr('y1',l=>l.source.y).attr('x2',l=>l.target.x).attr('y2',l=>l.target.y);
    this.circles.attr('cx',n=>n.x).attr('cy',n=>n.y);
    const placed=[];
    this.labelLayer.selectAll('text').attr('x',n=>n.x).attr('y',n=>{
      let y=n.y-this.nodeRadius(n)-6/this.scale;
      while(placed.some(p=>Math.abs(p.x-n.x)*this.scale<30&&Math.abs(p.y-y)*this.scale<16))y-=16/this.scale;
      placed.push({x:n.x,y});return y;
    });
  }
  nodeRadius(n){
    const base=n.displayRadius??5;
    return Math.min(22,Math.max(this.width<500?1.8:2.2,base*this.scale))/this.scale;
  }
  applyZoomStyles(){
    this.circles?.attr('r',n=>this.nodeRadius(n));
    this.labelLayer.selectAll('text').style('font-size',`${12/this.scale}px`).style('stroke-width',`${3/this.scale}px`);
    if(this.nodes)this.tick();
  }
  syncLabels(){
    this.labelLayer.selectAll('text').data(this.pendingLabels||[],n=>n.id).join('text').attr('text-anchor','middle').text(n=>n.id);
    this.applyZoomStyles();
  }
  update(metric,selected,matching,scaleMode='linear'){
    const metricChanged=this.metric!==metric||this.scaleMode!==scaleMode;
    this.metric=metric;this.scaleMode=scaleMode;
    // 仅变换展示比例；颜色和半径共用全图范围与同一个映射函数。
    const [min,max]=d3.extent(this.nodes,n=>n.centrality[metric]);
    // 同分使用平均名次，避免仅因节点编号不同而显示不同颜色或大小。
    const percentiles=new Map();
    if(scaleMode==='rank'){
      const values=this.nodes.map(n=>n.centrality[metric]).sort((a,b)=>a-b);
      for(let i=0;i<values.length;){
        let j=i+1;
        while(j<values.length&&values[j]===values[i])j++;
        percentiles.set(values[i],values.length<2?.5:(i+j-1)/2/(values.length-1));
        i=j;
      }
    }
    const proportion=value=>{
      if(scaleMode==='rank')return percentiles.get(value)??.5;
      if(max===min)return .5;
      const t=Math.max(0,Math.min(1,(value-min)/(max-min)));
      return scaleMode==='sqrt'?Math.sqrt(t):t;
    };
    this.radius=value=>3.5+11.5*proportion(value);
    const palette=d3.scaleLinear().domain([0,.5,1]).range(['#c7e9e2','#3fa38e','#07453a']).clamp(true);
    const color=value=>palette(proportion(value));
    const chosen=this.nodes.find(n=>n.id===selected),related=chosen?new Set([selected,...chosen.neighbors]):null;
    const opacity=n=>related?(related.has(n.id)?1:.09):(matching.has(n.id)?1:.09);
    this.circles.attr('opacity',opacity).attr('stroke',n=>n.id===selected?'#da8624':'#65968c').attr('stroke-width',n=>n.id===selected?3:.7);
    const top=[...this.nodes].filter(n=>matching.has(n.id)).sort((a,b)=>b.centrality[metric]-a.centrality[metric]).slice(0,5);
    this.pendingLabels=chosen?[chosen]:top;
    if(metricChanged||this.nodes.some(n=>n.displayRadius===undefined)){
      this.metricTimer?.stop();
      const initialized=this.nodes.every(n=>n.displayRadius!==undefined);
      const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      const duration=initialized?(reduced?100:1200):0;
      const fadeOut=reduced?80:250,fadeIn=reduced?100:350;
      const labelOpacity=Number(this.labelLayer.attr('opacity')??1);
      // 保存逐帧显示值；快速切换从当前帧继续，不重置节点或透明度。
      const tweens=this.nodes.map(n=>({n,
        radius:d3.interpolateNumber(n.displayRadius??this.radius(n.centrality[metric]),this.radius(n.centrality[metric])),
        color:d3.interpolateRgb(n.displayColor??color(n.centrality[metric]),color(n.centrality[metric]))}));
      const paint=t=>{
        const eased=d3.easeCubicInOut(t);
        for(const item of tweens){item.n.displayRadius=item.radius(eased);item.n.displayColor=item.color(eased)}
        this.circles.attr('fill',n=>n.displayColor);
        this.applyZoomStyles();
      };
      if(!duration){paint(1);this.metricAnimating=false;this.labelLayer.attr('opacity',1);this.syncLabels()}
      else {
        this.metricAnimating=true;
        this.metricTimer=d3.timer(elapsed=>{
          if(elapsed<fadeOut){
            this.labelLayer.attr('opacity',labelOpacity*(1-d3.easeCubicInOut(elapsed/fadeOut)));
          }else if(elapsed<fadeOut+duration){
            this.labelLayer.attr('opacity',0);
            paint((elapsed-fadeOut)/duration);
          }else{
            paint(1);
            this.syncLabels();
            const t=Math.min(1,(elapsed-fadeOut-duration)/fadeIn);
            this.labelLayer.attr('opacity',d3.easeCubicInOut(t));
            if(t===1){this.metricTimer.stop();this.metricAnimating=false}
          }
        });
      }
    }
    this.lines.attr('opacity',l=>related?((l.source.id===selected||l.target.id===selected)?.8:.045):(matching.has(l.source.id)&&matching.has(l.target.id)?.52:.04))
      .attr('stroke',l=>selected&&(l.source.id===selected||l.target.id===selected)?'#4c77b5':'#7896bc');
    if(!this.metricAnimating)this.syncLabels();
    this.circles.selectAll('title').text(n=>`节点 ${n.id} · ${n.type}\n${metric}: ${n.centrality[metric].toPrecision(5)}`);
  }
  fit(){if(!this.nodes?.length)return;const xs=d3.extent(this.nodes,n=>n.x),ys=d3.extent(this.nodes,n=>n.y),margin=35;const scale=Math.max(.15,Math.min(1.5,(this.width-2*margin)/Math.max(1,xs[1]-xs[0]),(this.height-2*margin-35)/Math.max(1,ys[1]-ys[0])));this.svg.call(this.zoom.transform,d3.zoomIdentity.translate(this.width/2,this.height/2-12).scale(scale).translate(-(xs[0]+xs[1])/2,-(ys[0]+ys[1])/2))}
  zoomBy(factor){this.svg.call(this.zoom.scaleBy,factor)}
  togglePause(){this.paused=!this.paused;if(this.paused)this.sim?.stop();else this.sim?.alpha(.1).restart();return this.paused}
}
