/** Grid sprite dengan thumbnail, pilih, hapus, duplikat (scratch-gui sprite-selector). */
import { memo } from "react";
import { ContextMenu, type ContextMenuItem, useContextMenuTrigger } from "../shell/ContextMenu";
import { useT } from "../shell/i18n";
import { CatIcon, CloseIcon } from "../shell/icons";
import type { TargetView } from "../shell/types";

interface SpriteItemProps {
  sprite: TargetView;
  selected: boolean;
  onSelect(id: string): void;
  onDelete(id: string): void;
  onDuplicate(id: string): void;
  onExport?: ((id: string) => void) | undefined;
}

const SpriteItem = memo(function SpriteItem({ sprite, selected, onSelect, onDelete, onDuplicate, onExport }: SpriteItemProps) {
  const t = useT();
  const menu = useContextMenuTrigger(true, 600);
  const items: ContextMenuItem[] = [
    { key: "duplicate", label: t("sprite.duplicate"), onSelect: () => onDuplicate(sprite.id) },
    ...(onExport ? [{ key: "export", label: t("sprite.export"), onSelect: () => onExport(sprite.id) }] : []),
    { key: "delete", label: t("sprite.delete"), danger: true, onSelect: () => onDelete(sprite.id) },
  ];
  return (
    <li className={`kb-sprite-item${selected ? " kb-sprite-item--selected" : ""}`} data-target-id={sprite.id}>
      <button
        type="button"
        className="kb-sprite-item__button"
        aria-pressed={selected}
        aria-label={sprite.name}
        onClick={() => onSelect(sprite.id)}
        onKeyDown={(e) => {
          if (e.key === "Delete" || e.key === "Backspace") onDelete(sprite.id);
        }}
        {...menu.triggerProps}
      >
        <span className="kb-sprite-item__thumb">
          {sprite.thumbnailUrl ? (
            <img src={sprite.thumbnailUrl} alt="" draggable={false} />
          ) : (
            <CatIcon size={36} className="kb-sprite-item__placeholder" />
          )}
        </span>
        <span className="kb-sprite-item__name">{sprite.name}</span>
      </button>
      {selected && (
        <button
          type="button"
          className="kb-sprite-item__delete"
          aria-label={`${t("sprite.delete")} ${sprite.name}`}
          title={t("sprite.delete")}
          onClick={() => onDelete(sprite.id)}
        >
          <CloseIcon size={12} />
        </button>
      )}
      <ContextMenu state={menu.state} items={items} onClose={menu.close} label={sprite.name} />
    </li>
  );
});

interface SpriteSelectorProps {
  sprites: readonly TargetView[];
  selectedId: string | null;
  onSelect(id: string): void;
  onDelete(id: string): void;
  onDuplicate(id: string): void;
  onExport?: ((id: string) => void) | undefined;
}

export function SpriteSelector(props: SpriteSelectorProps) {
  const t = useT();
  return (
    <ul className="kb-sprite-grid" aria-label={t("sprite.list")}>
      {props.sprites.map((s) => (
        <SpriteItem
          key={s.id}
          sprite={s}
          selected={s.id === props.selectedId}
          onSelect={props.onSelect}
          onDelete={props.onDelete}
          onDuplicate={props.onDuplicate}
          onExport={props.onExport}
        />
      ))}
    </ul>
  );
}
