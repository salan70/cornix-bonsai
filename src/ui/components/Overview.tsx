import type { VilDocument } from "../../core/vil/types.ts";
import { layerLabel, type WorkspaceLabels } from "../../workspace/labels.ts";

export function Overview({
  document,
  labels,
}: {
  readonly document: VilDocument;
  readonly labels: WorkspaceLabels;
}): React.JSX.Element {
  return (
    <section className="panel overview-panel">
      <h1>Overview</h1>
      <table>
        <thead>
          <tr>
            <th>Layer</th>
            <th>割り当て</th>
          </tr>
        </thead>
        <tbody>
          {document.layout.map((rows, index) => (
            <tr key={index}>
              <td>{layerLabel(labels, index)}</td>
              <td>
                {
                  rows
                    .flat()
                    .filter(
                      (entry) =>
                        typeof entry === "string" && entry !== "KC_NO" && entry !== "KC_TRNS",
                    ).length
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
