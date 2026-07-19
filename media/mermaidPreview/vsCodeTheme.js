"use strict";(()=>{var K={dark:null,fg:"--ib-fg",bg:"--ib-bg",surface:"--ib-surface",surfaceAlt:"--ib-surface-alt",sidebar:"--ib-sidebar",border:"--ib-border",line:"--ib-line",muted:"--ib-muted",accent:"--ib-accent",selection:"--ib-selection",warning:"--ib-warning",warningBorder:"--ib-warning-border",connectorMuted:"--ib-connector-muted",chartBlue:"--ib-chart-blue",chartPurple:"--ib-chart-purple",chartRed:"--ib-chart-red",chartYellow:"--ib-chart-yellow",fontFamily:"--ib-font-family",charts:null},w=["--vscode-editorWidget-border","--vscode-panel-border","--vscode-editorGroup-border","--vscode-sideBarSectionHeader-border"],z=["--vscode-editor-background"],J=["--vscode-sideBar-background"],D=["--vscode-editorWidget-background","--vscode-input-background"],V=["--vscode-input-background","--vscode-sideBar-background","--vscode-editorWidget-background"],$=["--vscode-editor-foreground","--vscode-foreground"],Q=["--vscode-descriptionForeground","--vscode-editorLineNumber-foreground",...$],_=["--vscode-focusBorder","--vscode-textLink-foreground","--vscode-button-background"],F=["--vscode-list-activeSelectionBackground","--vscode-editor-selectionBackground","--vscode-list-focusBackground"],Z=["--vscode-charts-purple",..._],P=["--vscode-charts-blue","--vscode-charts-orange","--vscode-charts-purple","--vscode-charts-red","--vscode-charts-yellow","--vscode-charts-green","--vscode-textLink-foreground","--vscode-badge-background","--vscode-button-secondaryBackground","--vscode-list-activeSelectionBackground","--vscode-focusBorder","--vscode-button-background"],O=P,I=P.slice(0,8),N=12;function ee(o){let{surface:t,surfaceAlt:s,sidebar:e,accent:i,chartBlue:l,chartPurple:n,muted:r}=o,a=[c(t,l,.22)??t,c(s,r,.2)??s,c(t,n,.18)??t,c(e,i,.12)??e,c(t,i,.15)??t,c(s,l,.12)??s];return Array.from({length:N},(d,b)=>a[b%a.length])}function te(o,t){let s=ee(t);for(let e=0;e<N;e++)o[`cScale${e}`]=s[e],o[`cScaleLabel${e}`]=t.fg,o[`cScaleInv${e}`]=t.border;o.scaleLabelColor=t.fg}function H(o){let t=o.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);if(t)return{r:parseInt(t[1].slice(0,2),16),g:parseInt(t[1].slice(2,4),16),b:parseInt(t[1].slice(4,6),16)}}function c(o,t,s){let e=H(o),i=H(t);if(!e||!i)return;let l=Math.max(0,Math.min(1,s)),n=1-l,r=a=>Math.max(0,Math.min(255,a)).toString(16).padStart(2,"0");return`#${r(Math.round(e.r*n+i.r*l))}${r(Math.round(e.g*n+i.g*l))}${r(Math.round(e.b*n+i.b*l))}`}function W(o,t,s,e){let i=o(...t),l=o(...s);return i&&l?c(i,l,e)??i:i??l}function f(o,...t){return o(...t)??"#000000"}function R(o,t,s){let e=s(),i=f(o,...$),l=f(o,...z),n=f(o,...D),r=f(o,...V),a=f(o,...J),d=f(o,...w),b=f(o,...Q),k=f(o,..._),u=f(o,...F),m=W(o,w,$,.6)??b??d,h=f(o,"--vscode-charts-blue","--vscode-textLink-foreground"),T=f(o,"--vscode-charts-purple","--vscode-focusBorder"),x=f(o,"--vscode-charts-red","--vscode-editorError-foreground"),C=o("--vscode-charts-yellow")??h,p=f(o,"--vscode-editorWarning-background","--vscode-editorWidget-background"),y=f(o,"--vscode-editorWarning-border","--vscode-focusBorder"),S=t("--vscode-font-family")||"sans-serif",L=P.map(v=>f(o,v));return{dark:e,fg:i,bg:l,surface:n,surfaceAlt:r,sidebar:a,border:d,line:i,muted:b,accent:k,selection:u,warning:p,warningBorder:y,connectorMuted:m,chartBlue:h,chartPurple:T,chartRed:x,chartYellow:C,fontFamily:S,charts:L}}function G(o,t){let s={darkMode:o.dark},e=(g,B)=>{B&&(s[g]=B)},i=(g,...B)=>{e(g,t(...B))},l=(g,B,Y,X)=>{e(g,W(t,Y,X,B))},{dark:n,fg:r,bg:a,surface:d,surfaceAlt:b,sidebar:k,border:u,muted:m,accent:h,selection:T,connectorMuted:x,chartBlue:C,chartRed:p,fontFamily:y}=o;e("background",a),e("textColor",r),e("titleColor",r),e("lineColor",r),e("arrowheadColor",r),e("defaultLinkColor",r),e("primaryColor",d),e("primaryTextColor",r),e("mainBkg",d),e("stateBkg",d),e("stateLabelColor",r),i("stateBorder",...w),e("labelBackgroundColor",k),e("nodeTextColor",r),e("primaryBorderColor",u),e("nodeBorder",u),e("secondaryColor",d),e("secondaryTextColor",r),e("secondaryBorderColor",u),e("tertiaryColor",k),e("tertiaryTextColor",r),e("tertiaryBorderColor",u),e("clusterBkg",k),e("clusterBorder",u),l("altBackground",.14,F,Z),e("compositeBackground",a),e("compositeTitleBackground",k),e("transitionColor",r),e("transitionLabelColor",r),e("specialStateColor",r),e("actorBkg",d),e("actorBorder",u),e("actorTextColor",r),e("actorLineColor",r),e("signalColor",r),e("signalTextColor",r),l("labelBoxBkgColor",.12,V,$),e("labelBoxBorderColor",x),e("labelTextColor",r),e("loopTextColor",r),e("activationBkgColor",T),i("activationBorderColor",..._,...w),e("sequenceNumberColor",r);let S=c(d,h,.12)??d,L=c(d,C,.38)??d,v=c(a,m,.35)??b,q=c(p,a,.18)??p;n?(e("sectionBkgColor",c(a,d,.35)??d),e("altSectionBkgColor",c(a,k,.25)??k),e("sectionBkgColor2",c(a,b,.35)??b)):(e("sectionBkgColor",b),e("altSectionBkgColor",a),e("sectionBkgColor2",d)),e("gridColor",u),e("vertLineColor",u),e("taskBkgColor",S),e("taskBorderColor",u),e("doneTaskBkgColor",v),e("doneTaskBorderColor",u),e("activeTaskBkgColor",L),e("activeTaskBorderColor",c(C,u,.45)??h),e("critBkgColor",q),e("critBorderColor",p),e("taskTextColor",r),e("taskTextDarkColor",r),e("taskTextOutsideColor",r),e("taskTextLightColor",n?"#ffffff":r),e("todayLineColor",h),l("noteBkgColor",.12,V,$),e("noteTextColor",r),e("noteBorderColor",x),e("edgeLabelBackground",a),e("edgeLabelColor",r),e("rowOdd",k),i("rowEven","--vscode-input-background","--vscode-sideBarSectionHeader-background",...D),i("errorBkgColor","--vscode-inputValidation-errorBackground","--vscode-editorError-background"),i("errorTextColor","--vscode-editorError-foreground",...$),e("branchLabelColor",r),e("commitLabelColor",r),e("commitLabelBackground",a),e("tagLabelColor",r),e("tagLabelBackground",d),e("tagLabelBorder",u),e("commitLineColor",o.muted);for(let g=0;g<8;g++)e(`gitBranchLabel${g}`,r);for(let g=0;g<I.length;g++)i(`git${g}`,I[g]);e("pieTitleTextColor",r),e("pieLegendTextColor",r),e("pieSectionTextColor",n?"#ffffff":a),e("pieStrokeColor",u),e("pieOuterStrokeColor",u),e("pieOpacity","1");for(let g=0;g<O.length;g++)i(`pie${g+1}`,O[g]);return te(s,o),s.fontFamily=y,s}function j(o){let{fg:t,bg:s,surface:e,surfaceAlt:i,sidebar:l,border:n,line:r,muted:a,selection:d,accent:b,warning:k,warningBorder:u,fontFamily:m,chartBlue:h,chartRed:T}=o,x=c(e,b,.12)??e,C=c(e,h,.38)??e,p=c(s,a,.35)??i,y=c(T,s,.18)??T,S=c(s,e,.35)??e,L=c(s,l,.25)??l,v=`
.node:not(:has(.divider)) rect,
.node:not(:has(.divider)) circle,
.node:not(:has(.divider)) ellipse,
.node:not(:has(.divider)) polygon,
.node:not(:has(.divider)) path`;return`
/* Generic typography */
text { fill: ${t}; }
foreignObject, foreignObject * { color: ${t}; font-family: ${m}; }
.messageText, .loopText, .actor > text, .nodeLabel, .cluster-label, .titleText,
.stateLabel text, g.stateGroup text, g.stateGroup .state-title, .statediagramTitleText,
.noteText, .edgeLabel, .edgeLabel p, .edgeLabel span,
.gitTitleText, .branch-label, [class*="branch-label"], .commit-label, .commit-id,
.commit-msg, .tag-label, .pieTitleText, .legend text {
  fill: ${t};
  color: ${t};
  font-family: ${m};
}

/* Nodes & actors */
${v} {
  fill: ${e};
  stroke: ${n};
  stroke-width: 1.5px;
}
.cluster ${v} {
  fill: ${e};
}
.actor {
  fill: ${e};
  stroke: ${n};
}

/* Clusters */
.cluster rect, .cluster path {
  fill: ${d};
  fill-opacity: 0.08;
  stroke: ${n};
  stroke-width: 1.5px;
  stroke-dasharray: 4 6;
}

/* Edges */
.edgePath path, .flowchart-link, .messageLine0, .messageLine1, .relationshipLine {
  stroke: ${r};
  stroke-width: 1.5px;
}
marker polygon, marker path {
  fill: ${r};
  stroke: none;
}

/* Labels */
.edgeLabel, .edgeLabel p, .edgeLabel span, .labelBkg {
  color: ${t};
  background-color: ${s};
}
/* Gantt */
.section0 { fill: ${S}; }
.section2 { fill: ${c(s,i,.35)??i}; }
.section1, .section3 { fill: ${L}; }
.sectionTitle, .sectionTitle tspan, .sectionTitle0, .sectionTitle1, .sectionTitle2, .sectionTitle3 {
  fill: ${t};
  font-family: ${m};
  font-weight: 600;
}
.grid .tick text {
  fill: ${a} !important;
  stroke: none !important;
  font-family: ${m};
}
.grid .tick line {
  stroke: ${n};
  opacity: 0.55;
}
.grid path {
  stroke-width: 0;
}
.task0, .task1, .task2, .task3 {
  fill: ${x};
  stroke: ${n};
}
.active0, .active1, .active2, .active3 {
  fill: ${C};
  stroke: ${c(h,n,.45)??b};
}
.done0, .done1, .done2, .done3 {
  fill: ${p};
  stroke: ${n};
}
.crit0, .crit1, .crit2, .crit3 {
  fill: ${y};
  stroke: ${T};
}
.taskText0, .taskText1, .taskText2, .taskText3,
.activeText0, .activeText1, .activeText2, .activeText3,
.doneText0, .doneText1, .doneText2, .doneText3 {
  fill: ${t};
  font-family: ${m};
}
.critText0, .critText1, .critText2, .critText3 {
  fill: #ffffff;
  font-family: ${m};
}
.taskTextOutsideLeft, .taskTextOutsideRight,
.taskTextOutside0, .taskTextOutside1, .taskTextOutside2, .taskTextOutside3,
.milestoneText {
  fill: ${t};
  font-family: ${m};
}
rect.task.milestone {
  fill: ${a};
  stroke: ${n};
}
.today {
  stroke: ${b};
}

/* Sequence notes */
.note {
  fill: ${k};
  stroke: ${u};
}

/* ER relationship labels */
.relationshipLabelBox {
  fill: ${e};
  stroke: ${n};
}

/* Git */
.commit-label-bkg, .branchLabelBkg, [class*="branchLabelBkg"] {
  fill: ${e};
  stroke: ${n};
  stroke-width: 1px;
}
.branch {
  stroke: ${a};
  opacity: 0.85;
}
.commit-merge, .commit-highlight-inner {
  fill: ${h};
  stroke: ${h};
}

/* Timeline / journey / mindmap sections */
.section-root rect, .section-root path, .section-root circle {
  fill: ${c(e,b,.1)??e};
  stroke: ${n};
}
.section-root text {
  fill: ${t};
  font-family: ${m};
}
.timeline-node text, .section-0 text, .section-1 text, .section-2 text, .section-3 text {
  fill: ${t};
  font-family: ${m};
}
.timeline-node path, .timeline-node rect,
.section-0 path, .section-1 path, .section-2 path, .section-3 path,
.section-0 rect, .section-1 rect, .section-2 rect, .section-3 rect {
  stroke: ${n};
}
.timeline-node line, .section-0 line, .section-1 line, .section-2 line, .section-3 line {
  stroke: ${n} !important;
  stroke-width: 1px !important;
}
.lineWrapper line {
  stroke: ${a} !important;
  stroke-width: 1px !important;
}

/* Pie */
.pieCircle, .pieOuterCircle {
  stroke: ${n};
  opacity: 1;
}
`.trim()}function U(o,t){for(let[s,e]of Object.entries(K)){if(!e)continue;let i=t[s];typeof i=="string"&&o.style.setProperty(e,i)}}function E(){return document.body.classList.contains("vscode-dark")||document.body.classList.contains("vscode-high-contrast")&&!document.body.classList.contains("vscode-high-contrast-light")}function A(o){return getComputedStyle(document.documentElement).getPropertyValue(o).trim()}function oe(o){let t=o.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);if(!t)return;let s=parseInt(t[1],10),e=parseInt(t[2],10),i=parseInt(t[3],10),l=t[4]!==void 0?Math.round(parseFloat(t[4])*255):255,n=r=>Math.max(0,Math.min(255,r)).toString(16).padStart(2,"0");return l<255?`#${n(s)}${n(e)}${n(i)}${n(l)}`:`#${n(s)}${n(e)}${n(i)}`}function re(o){let t=document.createElement("span");t.style.display="none",t.style.color=o,document.body.appendChild(t);try{return oe(getComputedStyle(t).color)}finally{t.remove()}}function M(...o){for(let t of o){if(!A(t))continue;let s=re(`var(${t})`);if(s)return s}}window.IbMermaidVsCodeTheme={getTokens(){return R(M,A,E)},getThemeVariables(o){let t=o??R(M,A,E);return G(t,M)},getThemeCSS(o){let t=o??R(M,A,E);return j(t)},applyDiagramTokens(o){let t=R(M,A,E);U(o,t)}};})();
