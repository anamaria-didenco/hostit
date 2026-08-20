import React, { useRef, useEffect, useCallback, useState } from 'react';

interface RichTextareaProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

// Two semantic marks instead of a free colour picker and a font-size menu.
//
// The old toolbar let anyone set 6 text colours, 5 highlight tints and 4 font
// sizes on a document that prints as the venue's BEO — which is how a runsheet
// ends up with X-Large purple text on the kitchen copy. These map to the
// editorial tokens instead, so whatever staff mark up still prints on-brand.
const MARK_HIGHLIGHT = '#f7efdd'; // amber tint — "look at this"
const MARK_ALERT = '#b3261e';     // editorial red — "this matters"

export function RichTextarea({ value, onChange, placeholder, className = '', minHeight = '80px' }: RichTextareaProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  // Toolbars stay collapsed until the field is being edited. Three of these
  // render on one page; permanently-visible chrome for all of them was most of
  // what made the builder feel cluttered.
  const [focused, setFocused] = useState(false);
  // null sentinel (not `value`) so the first effect run ALWAYS seeds the
  // editor's innerHTML. Initialising to `value` meant a component that mounted
  // with content already loaded (e.g. collapsing and reopening a section, or
  // data arriving before mount) skipped the write and rendered an empty editor
  // while the saved text still existed — it printed on the PDF but couldn't be
  // seen or edited on screen.
  const lastHtml = useRef<string | null>(null);

  useEffect(() => {
    if (editorRef.current && value !== lastHtml.current) {
      editorRef.current.innerHTML = value || '';
      lastHtml.current = value;
    }
  }, [value]);

  const handleInput = useCallback(() => {
    const html = editorRef.current?.innerHTML ?? '';
    lastHtml.current = html;
    onChange(html);
  }, [onChange]);

  const exec = (command: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, val);
    handleInput();
  };

  const ToolBtn = ({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) => (
    <button
      type="button"
      // preventDefault keeps focus inside the editor, so the toolbar doesn't
      // collapse out from under the click and the selection survives.
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      title={label}
      aria-label={label}
      className="inline-flex items-center gap-1 min-h-[44px] px-2.5 font-dm text-xs rounded-sm border border-transparent text-ink/70 hover:border-gold/40 hover:text-ink transition-colors"
    >
      {children}
    </button>
  );

  return (
    <div className={`border border-gold/30 bg-white rounded-none ${className}`}>
      {/* Toolbar — on focus only. A one-line resting strip keeps the field's
          height stable so the page doesn't jump when you click into it. */}
      {focused ? (
        <div className="flex items-center gap-0.5 px-2 border-b border-gold/20 bg-linen/40 flex-wrap">
          <ToolBtn onClick={() => exec('bold')} label="Bold"><span className="font-bold">B</span></ToolBtn>
          <ToolBtn onClick={() => exec('italic')} label="Italic"><span className="italic">I</span></ToolBtn>
          <div className="w-px h-4 bg-gold/30 mx-1 self-center" />
          <ToolBtn onClick={() => exec('hiliteColor', MARK_HIGHLIGHT)} label="Highlight">
            <span aria-hidden className="w-3 h-3 rounded-sm border border-gold/40" style={{ backgroundColor: MARK_HIGHLIGHT }} />
            Highlight
          </ToolBtn>
          <ToolBtn onClick={() => exec('foreColor', MARK_ALERT)} label="Alert">
            <span aria-hidden className="w-3 h-3 rounded-sm" style={{ backgroundColor: MARK_ALERT }} />
            Alert
          </ToolBtn>
          <div className="w-px h-4 bg-gold/30 mx-1 self-center" />
          <ToolBtn
            onClick={() => { exec('removeFormat'); exec('hiliteColor', 'transparent'); }}
            label="Clear formatting"
          >
            Clear
          </ToolBtn>
        </div>
      ) : (
        <div className="px-3 py-1 border-b border-gold/20 bg-linen/20 font-dm text-[10px] text-ink/35 select-none">
          Click to edit — bold, italic, highlight and alert
        </div>
      )}

      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        tabIndex={0}
        suppressContentEditableWarning
        onInput={handleInput}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        data-placeholder={placeholder}
        className="px-3 py-2.5 font-dm text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-forest/40 vf-rich-editor"
        style={{ minHeight }}
      />
    </div>
  );
}
