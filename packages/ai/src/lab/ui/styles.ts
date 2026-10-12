/**
 * CSS AI Lab (dirender sebagai teks di <style>, bukan HTML). Warna mengikuti KodyBlocks:
 * hijau AI #0FBD8C, teks #575E75, gradien header #15364c -> #08786f. Target sentuh >= 44px
 * untuk tablet/iPad; tata letak dua kolom bila ruang cukup (container query), satu kolom di HP/iPad tegak.
 */
export const CLASS_COLOURS = ["#4C97FF", "#FF8C1A", "#9966FF", "#0FBD8C", "#FF6680", "#FFAB19", "#5CB1D6", "#CF63CF"];

export const LAB_CSS = `
.kal{--kal-ai:#0FBD8C;--kal-ai-dark:#0B9A72;--kal-ink:#575E75;--kal-muted:#6B7385;--kal-line:#D9E3F2;--kal-soft:#F2F7FD;--kal-err:#B3261E;
  container-type:inline-size;font:15px/1.4 "Helvetica Neue",Helvetica,Arial,sans-serif;color:var(--kal-ink);background:#fff;
  width:min(1100px,calc(100vw - 32px));max-width:100%;box-sizing:border-box;display:flex;flex-direction:column;min-height:0}
.kal *,.kal *::before,.kal *::after{box-sizing:border-box}
.kal-head{display:flex;align-items:center;gap:12px;padding:10px 14px;background:linear-gradient(90deg,#15364c,#08786f);color:#fff;border-radius:8px 8px 0 0;position:sticky;top:0;z-index:3}
.kal-head h2{margin:0;font-size:18px;flex:1;display:flex;align-items:center;gap:8px}
.kal-head .kal-btn{background:rgba(255,255,255,.16);color:#fff;border-color:transparent}
.kal-tabs{display:flex;gap:6px;padding:10px 14px 0;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:thin}
.kal-tab{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:8px 14px;border:1px solid var(--kal-line);border-bottom:none;border-radius:10px 10px 0 0;background:var(--kal-soft);color:var(--kal-ink);font:inherit;font-weight:600;cursor:pointer;white-space:nowrap}
.kal-tab[aria-selected=true]{background:#fff;color:var(--kal-ai-dark);box-shadow:inset 0 3px 0 var(--kal-ai)}
.kal-tab svg{width:20px;height:20px}
.kal-body{border-top:1px solid var(--kal-line);padding:14px;display:grid;gap:14px;grid-template-columns:1fr}
@container (min-width:820px){.kal-body{grid-template-columns:minmax(0,1fr) 360px;align-items:start}.kal-side{position:sticky;top:64px}}
.kal-intro{margin:0;color:var(--kal-muted);font-size:14px}
.kal-col{display:flex;flex-direction:column;gap:12px;min-width:0}
.kal-side{display:flex;flex-direction:column;gap:12px;min-width:0}
.kal-card{border:1px solid var(--kal-line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px;background:#fff}
.kal-card h3{margin:0;font-size:15px}
.kal-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.kal-grow{flex:1;min-width:0}
.kal-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:8px 14px;border-radius:10px;border:1px solid var(--kal-line);background:#fff;color:var(--kal-ink);font:inherit;font-weight:600;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.kal-btn:disabled{opacity:.45;cursor:not-allowed}
.kal-btn:focus-visible,.kal-tab:focus-visible,.kal-input:focus-visible{outline:3px solid #855CD6;outline-offset:2px}
.kal-btn--main{background:var(--kal-ai);border-color:var(--kal-ai);color:#fff}
.kal-btn--main:not(:disabled):hover{background:var(--kal-ai-dark)}
.kal-btn--danger{color:var(--kal-err)}
.kal-btn--hold{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none}
.kal-btn--hold[data-active=true]{background:#C0392B;border-color:#C0392B;color:#fff}
.kal-btn--icon{min-width:44px;padding:8px}
.kal-input{min-height:44px;padding:8px 10px;border:1px solid var(--kal-line);border-radius:10px;font:inherit;color:var(--kal-ink);min-width:0;width:100%}
.kal-name{font-weight:700;font-size:16px;border-color:transparent;background:transparent;padding-left:4px}
.kal-name:hover,.kal-name:focus{border-color:var(--kal-line);background:#fff}
.kal-dot{width:14px;height:14px;border-radius:7px;flex:none}
.kal-count{font-size:13px;color:var(--kal-muted);white-space:nowrap}
.kal-samples{display:grid;grid-template-columns:repeat(auto-fill,minmax(56px,1fr));gap:6px;max-height:192px;overflow-y:auto}
.kal-sample{position:relative;aspect-ratio:1;border-radius:8px;background:var(--kal-soft);border:1px solid var(--kal-line);overflow:hidden;display:grid;place-items:center}
.kal-sample img,.kal-sample svg{width:100%;height:100%;object-fit:cover;display:block}
.kal-sample button{position:absolute;top:2px;right:2px;width:26px;height:26px;border-radius:13px;border:none;background:rgba(0,0,0,.6);color:#fff;font-size:15px;line-height:1;cursor:pointer;display:grid;place-items:center;padding:0}
.kal-sample--saved{font-size:11px;color:var(--kal-muted);text-align:center;padding:4px}
.kal-chips{display:flex;flex-wrap:wrap;gap:6px;max-height:160px;overflow-y:auto}
.kal-chip{display:inline-flex;align-items:center;gap:4px;max-width:100%;padding:4px 4px 4px 10px;border-radius:999px;background:var(--kal-soft);border:1px solid var(--kal-line);font-size:14px}
.kal-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kal-chip button{width:32px;height:32px;border:none;border-radius:16px;background:transparent;color:var(--kal-muted);cursor:pointer;font-size:16px}
.kal-video{position:relative;width:100%;aspect-ratio:4/3;background:#1b2733;border-radius:12px;overflow:hidden}
.kal-video canvas{width:100%;height:100%;display:block}
.kal-video__msg{position:absolute;inset:0;display:grid;place-items:center;text-align:center;color:#fff;padding:16px;font-size:14px}
.kal-bars{display:flex;flex-direction:column;gap:6px}
.kal-bar{display:grid;grid-template-columns:minmax(60px,35%) 1fr 44px;gap:8px;align-items:center;font-size:14px}
.kal-bar__name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kal-bar__track{height:18px;border-radius:9px;background:var(--kal-soft);overflow:hidden}
.kal-bar__fill{height:100%;border-radius:9px;transition:width .15s linear}
.kal-bar__pct{text-align:right;font-variant-numeric:tabular-nums}
.kal-top{font-size:20px;font-weight:700;color:var(--kal-ink);min-height:28px}
.kal-progress{height:12px;border-radius:6px;background:var(--kal-soft);overflow:hidden}
.kal-progress div{height:100%;background:var(--kal-ai);transition:width .1s linear}
.kal-pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:13px;font-weight:600;background:var(--kal-soft)}
.kal-pill--ok{background:#DDF6EE;color:#0B7A5A}
.kal-pill--warn{background:#FFF2D6;color:#8A5A00}
.kal-list{margin:0;padding-left:20px;font-size:14px}
.kal-note{font-size:13px;color:var(--kal-muted);margin:0}
.kal-error{font-size:14px;color:var(--kal-err);margin:0;background:#FDECEA;border-radius:8px;padding:8px 10px}
.kal-meter{height:8px;border-radius:4px;background:var(--kal-soft);overflow:hidden}
.kal-meter div{height:100%;background:#FF8C1A}
.kal-confirm{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#FFF2D6;border-radius:10px;padding:10px 12px}
.kal-check{display:flex;gap:8px;align-items:flex-start;font-size:13px;color:var(--kal-muted)}
.kal-check input{width:22px;height:22px;flex:none;margin:0}
.kal-add{border-style:dashed;color:var(--kal-ai-dark)}
@media (prefers-reduced-motion:reduce){.kal-bar__fill,.kal-progress div{transition:none}}
`;
