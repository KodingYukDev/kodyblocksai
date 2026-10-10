/** CSS workspace/flyout/menu/dialog bergaya scratch-blocks + scratch-gui. Disuntik sekali per dokumen. */
import { UI_COLOURS } from "../colours";
import { FONT_FAMILY } from "./dom";

const STYLE_ID = "kb-workspace-style";

const CSS = `
.kb-ws{position:relative;display:flex;width:100%;height:100%;overflow:hidden;font-family:${FONT_FAMILY};
  user-select:none;-webkit-user-select:none;touch-action:none;background:${UI_COLOURS.workspace};color:${UI_COLOURS.toolboxText}}
.kb-ws *{box-sizing:border-box}
.kb-ws-categories{width:60px;flex:none;background:${UI_COLOURS.toolbox};border-right:1px solid hsla(0,0%,0%,.15);
  overflow-y:auto;overflow-x:hidden;font-size:.7rem;scrollbar-width:none}
.kb-ws-categories::-webkit-scrollbar{display:none}
.kb-ws-cat{padding:.375rem 0;cursor:pointer;text-align:center;line-height:1.1;word-break:break-word}
.kb-ws-cat:hover{color:${UI_COLOURS.toolboxHover}}
.kb-ws-cat.kb-selected{background:${UI_COLOURS.toolboxSelected}}
.kb-ws-cat-bubble{width:1.25rem;height:1.25rem;border:1px solid;border-radius:100%;margin:0 auto .125rem}
.kb-ws-cat-icon{width:1.25rem;height:1.25rem;margin:0 auto .125rem;background-size:100%;background-repeat:no-repeat}
.kb-ws-flyout{position:relative;width:250px;flex:none;background:${UI_COLOURS.flyout};border-right:1px solid hsla(0,0%,0%,.15);overflow:hidden}
.kb-ws-main{position:relative;flex:1;overflow:hidden;min-width:0}
.kb-ws svg{display:block;width:100%;height:100%}
.kb-text{font:500 12pt ${FONT_FAMILY};pointer-events:none}
.kb-block{cursor:grab}
.kb-dragging .kb-block{cursor:grabbing}
.kb-field-text-in-shadow,.kb-field-dropdown,.kb-field-dropdown-in-shadow,.kb-field-colour{cursor:pointer}
.kb-glow-block>.kb-block-path{stroke:${UI_COLOURS.stackGlow};stroke-width:3}
.kb-replace{stroke:${UI_COLOURS.replacementGlow};stroke-width:3}
.kb-replace>.kb-block-path{stroke:${UI_COLOURS.replacementGlow};stroke-width:3}
.kb-selected{stroke-width:2}
.kb-flyout-label{font:bold 14pt ${FONT_FAMILY};fill:#575E75}
.kb-flyout-button rect{fill:transparent;stroke:#c6c6c6;cursor:pointer}
.kb-flyout-button:hover rect{fill:#fff}
.kb-flyout-button text{font:500 12pt ${FONT_FAMILY};fill:${UI_COLOURS.textFieldText};pointer-events:none}
.kb-checkbox rect{fill:#fff;stroke:#c8c8c8;cursor:pointer}
.kb-checkbox.kb-checked rect{fill:${UI_COLOURS.toolboxHover};stroke:#3373cc}
.kb-checkbox path{fill:none;stroke:#fff;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;display:none}
.kb-checkbox.kb-checked path{display:block}
.kb-zoom{position:absolute;right:12px;bottom:12px;display:flex;flex-direction:column;gap:8px;z-index:5}
.kb-zoom button{width:36px;height:36px;border-radius:50%;border:1px solid hsla(0,0%,0%,.15);background:#fff;cursor:pointer;
  display:flex;align-items:center;justify-content:center;padding:0}
.kb-zoom button:hover{background:#e9f1fc}
.kb-zoom svg{width:20px;height:20px}
.kb-menu{position:absolute;z-index:50;min-width:140px;background:#fff;border:1px solid hsla(0,0%,0%,.15);border-radius:4px;
  box-shadow:0 2px 6px hsla(0,0%,0%,.15);padding:4px 0;font-size:12px}
.kb-menu-item{padding:6px 16px 6px 28px;cursor:pointer;white-space:nowrap}
.kb-menu-item:hover{background:hsla(215,100%,65%,.15)}
.kb-menu-item.kb-disabled{opacity:.4;cursor:default;background:none}
.kb-dropdown{position:absolute;z-index:60;border-radius:4px;padding:4px;max-height:300px;overflow-y:auto;color:#fff;
  box-shadow:0 0 8px 1px hsla(0,0%,0%,.3);font-size:12pt;font-weight:500}
.kb-dropdown-item{padding:6px 12px 6px 28px;border-radius:4px;cursor:pointer;position:relative;white-space:nowrap}
.kb-dropdown-item:hover{background:hsla(0,0%,0%,.2)}
.kb-dropdown-item.kb-checked::before{content:"\\2713";position:absolute;left:8px}
.kb-colour{position:absolute;z-index:60;background:#fff;border-radius:4px;padding:12px;width:220px;color:${UI_COLOURS.textFieldText};
  box-shadow:0 0 8px 1px hsla(0,0%,0%,.3);font-size:.75rem}
.kb-colour label{display:block;margin:6px 0 2px}
.kb-colour input[type=range]{width:100%}
.kb-field-editor{position:absolute;z-index:60;font:500 12pt ${FONT_FAMILY};color:${UI_COLOURS.textFieldText};text-align:center;
  border:1px solid hsla(0,0%,0%,.15);background:#fff;outline:none;padding:0 8px;box-shadow:0 0 0 4px hsla(0,0%,100%,.3)}
.kb-report{position:absolute;z-index:40;background:${UI_COLOURS.valueReportBackground};border:1px solid ${UI_COLOURS.valueReportBorder};
  border-radius:4px;padding:4px 8px;font-size:12pt;color:${UI_COLOURS.textFieldText};max-width:300px;word-break:break-word;pointer-events:none}
.kb-modal{position:absolute;inset:0;z-index:100;background:hsla(215,100%,65%,.9);display:flex;align-items:flex-start;justify-content:center;padding-top:10vh}
.kb-dialog{width:min(360px,calc(100% - 32px));background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 0 0 4px hsla(0,0%,100%,.25);color:${UI_COLOURS.textFieldText}}
.kb-dialog-wide{width:min(560px,calc(100% - 32px))}
.kb-dialog-header{height:50px;line-height:50px;background:${UI_COLOURS.toolboxHover};color:#fff;font-weight:bold;text-align:center;font-size:1rem}
.kb-dialog-body{padding:24px}
.kb-dialog-body p{margin:0 0 8px;font-weight:bold;font-size:.875rem}
.kb-dialog input[type=text]{width:100%;height:48px;padding:0 16px;border:1px solid hsla(0,0%,0%,.15);border-radius:8px;font-size:.875rem;
  color:${UI_COLOURS.textFieldText};outline:none;transition:box-shadow .2s}
.kb-dialog input[type=text]:focus{border-color:${UI_COLOURS.toolboxHover};box-shadow:0 0 0 4px hsla(215,100%,65%,.35)}
.kb-dialog-options{display:flex;gap:16px;margin:16px 0 0;font-size:.8rem;flex-wrap:wrap}
.kb-dialog-options label{display:flex;align-items:center;gap:6px;cursor:pointer}
.kb-dialog-buttons{display:flex;justify-content:flex-end;gap:8px;margin-top:24px}
.kb-dialog-buttons button{min-width:80px;height:40px;border-radius:8px;font-weight:bold;font-size:.875rem;cursor:pointer;padding:0 16px}
.kb-btn-cancel{background:#fff;border:1px solid hsla(0,0%,0%,.15);color:${UI_COLOURS.textFieldText}}
.kb-btn-ok{background:${UI_COLOURS.toolboxHover};border:1px solid ${UI_COLOURS.toolboxHover};color:#fff}
.kb-dialog-error{color:#d33;font-size:.8rem;margin-top:8px;min-height:1em}
.kb-proc-preview{background:#e9eef2;border-radius:8px;padding:24px 12px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center;min-height:96px}
.kb-proc-block{display:flex;flex-wrap:wrap;gap:6px;align-items:center;background:#FF6680;border:1px solid #FF3355;border-radius:4px;padding:10px 12px}
.kb-proc-block input{height:32px!important;border-radius:16px!important;min-width:40px;width:auto!important;padding:0 10px!important;text-align:center}
.kb-proc-block .kb-proc-bool input{border-radius:4px!important;clip-path:polygon(12px 0,calc(100% - 12px) 0,100% 50%,calc(100% - 12px) 100%,12px 100%,0 50%)}
.kb-proc-block .kb-proc-label input{background:transparent;color:#fff;border-color:hsla(0,0%,100%,.5)}
.kb-proc-part{position:relative;display:flex;align-items:center}
.kb-proc-remove{position:absolute;top:-22px;left:50%;transform:translateX(-50%);width:20px;height:20px;border-radius:50%;border:none;
  background:#FF3355;color:#fff;cursor:pointer;font-size:12px;line-height:20px;padding:0}
.kb-proc-adders{display:flex;gap:12px;margin-top:16px;justify-content:center;flex-wrap:wrap}
.kb-proc-adders button{flex:1;min-width:100px;padding:10px 8px;border-radius:8px;border:1px solid hsla(0,0%,0%,.15);background:#fff;cursor:pointer;
  font-size:.75rem;white-space:pre-line;color:${UI_COLOURS.textFieldText}}
.kb-proc-adders button:hover{border-color:${UI_COLOURS.toolboxHover}}
`;

export function injectStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  (doc.head ?? doc.documentElement).appendChild(style);
}
