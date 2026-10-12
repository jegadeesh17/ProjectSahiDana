import { useId } from 'react';
import { DEMO_CASES } from '../domain/presets';
import type { DemoKey } from '../domain/presets';
import { Bi } from '../i18n/Bi';
import type { StringId } from '../i18n/strings';
import type { MockExplainMode, MockLlmMode } from '../services/mockAdapter';

export type ConnectionMode = 'auto' | 'online' | 'offline';
export type ExampleKey = 'english' | 'hinglish' | 'hindi' | 'unmatched';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: ConnectionMode;
  onConnection: (mode: ConnectionMode) => void;
  llm: MockLlmMode;
  onLlm: (mode: MockLlmMode) => void;
  explainMode: MockExplainMode;
  onExplainMode: (mode: MockExplainMode) => void;
  onExample: (key: ExampleKey) => void;
  onDemo: (key: DemoKey) => void;
  onReset: () => void;
}

function Group<T extends string>({
  labelId,
  value,
  options,
  onChange,
}: {
  labelId: StringId;
  value: T;
  options: { value: T; labelId: StringId }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="proto-group">
      <p id={id} className="proto-label">
        <Bi id={labelId} />
      </p>
      <div className="proto-opts" role="group" aria-labelledby={id}>
        {options.map((o) => (
          <button key={o.value} type="button" className="proto-btn" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
            <Bi id={o.labelId} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Clearly labelled reviewer control: forces offline, LLM errors, rate limit and the three Explain outcomes. */
export function PrototypeStatesPanel(props: Props) {
  const { open, onOpenChange } = props;
  const panelId = useId();
  return (
    <div className="proto" data-testid="prototype-strip">
      <button type="button" className="proto-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => onOpenChange(!open)}>
        <span className="proto-open">
          <Bi id="label_proto_states" />
          <span className="chev" data-open={open} aria-hidden="true" />
        </span>
      </button>
      {open && (
        <div id={panelId} className="proto-body">
          <p className="proto-hint">
            <Bi id="label_proto_hint" />
          </p>
          <Group
            labelId="label_proto_connection"
            value={props.connection}
            onChange={props.onConnection}
            options={[
              { value: 'auto', labelId: 'proto_conn_auto' },
              { value: 'online', labelId: 'proto_conn_online' },
              { value: 'offline', labelId: 'proto_conn_offline' },
            ]}
          />
          <Group
            labelId="label_proto_llm"
            value={props.llm}
            onChange={props.onLlm}
            options={[
              { value: 'ok', labelId: 'proto_llm_ok' },
              { value: 'upstream_error', labelId: 'proto_llm_error' },
              { value: 'rate_limited', labelId: 'proto_llm_rate' },
              { value: 'timeout', labelId: 'proto_llm_timeout' },
            ]}
          />
          <Group
            labelId="label_proto_explain"
            value={props.explainMode}
            onChange={props.onExplainMode}
            options={[
              { value: 'verified', labelId: 'proto_explain_verified' },
              { value: 'regenerated', labelId: 'proto_explain_regenerated' },
              { value: 'fallback_untraced', labelId: 'proto_explain_fallback' },
            ]}
          />
          <div className="proto-group">
            <p className="proto-label">
              <Bi id="label_proto_examples" />
            </p>
            <div className="proto-opts">
              {(
                [
                  ['english', 'proto_example_english'],
                  ['hinglish', 'proto_example_hinglish'],
                  ['hindi', 'proto_example_hindi'],
                  ['unmatched', 'proto_example_unmatched'],
                ] as const
              ).map(([key, labelId]) => (
                <button key={key} type="button" className="proto-btn" onClick={() => props.onExample(key)}>
                  <Bi id={labelId} />
                </button>
              ))}
            </div>
          </div>
          <div className="proto-group">
            <p className="proto-label">
              <Bi id="label_demo_cases" />
            </p>
            <div className="proto-opts">
              {DEMO_CASES.map((c) => (
                <button key={c.key} type="button" className="proto-btn" data-demo={c.key} onClick={() => props.onDemo(c.key)}>
                  <Bi id={c.labelId} />
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="proto-btn proto-reset" onClick={props.onReset}>
            <Bi id="action_proto_reset" />
          </button>
        </div>
      )}
    </div>
  );
}
