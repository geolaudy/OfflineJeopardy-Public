// Board text with its line breaks and bold / italics / underline (R8-7, R8-8), the same on the TV,
// the host and phones. Built from parsed runs — never from HTML.
import { Fragment, useMemo, type ReactNode } from 'react';
import { parseRich } from '../../shared/richText';

export function RichText({ text }: { text: string | null | undefined }) {
  const lines = useMemo(() => parseRich(text ?? ''), [text]);
  return (
    <>
      {lines.map((runs, li) => (
        <Fragment key={li}>
          {li > 0 && <br />}
          {runs.map((r, ri) => {
            let n: ReactNode = r.text;
            if (r.u) n = <u>{n}</u>;
            if (r.i) n = <em>{n}</em>;
            if (r.b) n = <strong>{n}</strong>;
            return <Fragment key={ri}>{n}</Fragment>;
          })}
        </Fragment>
      ))}
    </>
  );
}
