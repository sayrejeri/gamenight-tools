"use client";

import { useRef, type ChangeEvent, type ComponentProps } from "react";
import {
  BracketGenerator as BracketGeneratorBase,
  type BracketStatus,
  type DatabaseBracketFormat,
} from "@/components/bracket/bracket-generator-base";

export type { BracketStatus, DatabaseBracketFormat };

type Props = ComponentProps<typeof BracketGeneratorBase>;

function entrantNameInputs(root: HTMLDivElement): HTMLInputElement[] {
  return Array.from(root.querySelectorAll<HTMLInputElement>('.participant-editor input[aria-label^="Entrant "]'));
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function BracketGenerator(props: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const savedEntrantPool = useRef<string[] | null>(null);

  function handleChangeCapture(event: ChangeEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || target.id !== "bracket-format") return;
    const root = rootRef.current;
    if (!root) return;

    const currentNames = entrantNameInputs(root).map((input) => input.value);

    if (target.value === "three") {
      savedEntrantPool.current = currentNames;
      window.setTimeout(() => {
        const countInput = rootRef.current?.querySelector<HTMLInputElement>("#participant-count");
        if (countInput && Number(countInput.value) !== 3) setNativeInputValue(countInput, "3");
      }, 0);
      return;
    }

    const saved = savedEntrantPool.current;
    if (!saved) return;

    const restoredNames = [...saved];
    currentNames.slice(0, 3).forEach((name, index) => {
      restoredNames[index] = name;
    });
    savedEntrantPool.current = null;

    window.setTimeout(() => {
      const currentRoot = rootRef.current;
      if (!currentRoot) return;
      const countInput = currentRoot.querySelector<HTMLInputElement>("#participant-count");
      if (countInput && Number(countInput.value) !== restoredNames.length) {
        setNativeInputValue(countInput, String(restoredNames.length));
      }
      window.requestAnimationFrame(() => {
        const latestRoot = rootRef.current;
        if (!latestRoot) return;
        entrantNameInputs(latestRoot).forEach((input, index) => {
          const name = restoredNames[index];
          if (name != null && input.value !== name) setNativeInputValue(input, name);
        });
      });
    }, 0);
  }

  return (
    <div ref={rootRef} onChangeCapture={handleChangeCapture}>
      <BracketGeneratorBase {...props} />
    </div>
  );
}
