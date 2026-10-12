import { Bi } from '../i18n/Bi';

/** Online/offline status shown at the right of the green band. */
export function ConnectivityBanner({ online }: { online: boolean }) {
  return (
    <div className="conn" role="status" data-online={online}>
      <span className="conn-dot" aria-hidden="true" />
      <Bi id={online ? 'state_online' : 'state_offline'} />
    </div>
  );
}
