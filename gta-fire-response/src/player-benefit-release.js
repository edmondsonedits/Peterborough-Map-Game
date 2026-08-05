export function installPlayerBenefitRelease(game) {
  const eyebrow = document.querySelector('.start-card .eyebrow');
  const intro = document.querySelector('.start-card > p');
  const features = document.querySelector('.start-card .feature-grid');
  const version = document.getElementById('version-text');

  if (eyebrow) eyebrow.textContent = 'Player-benefit audited release · v1.1';
  if (intro) intro.textContent = 'A fully fleshed-out Peterborough fire-response game with precision mobile apparatus control, clearer emergency traffic, safer interactions, tactical operations, three stations, four apparatus and persistent career progression.';
  if (features) features.innerHTML = '<div><b>More controllable response</b><span>Precision thumb-stick throttle and improved civilian lane behaviour.</span></div><div><b>Safer and clearer play</b><span>Blocked exits are refused and menus no longer trigger hidden controls.</span></div><div><b>Complete career loop</b><span>23 incidents, ranks, perks, medals, records, apparatus service and shift challenges.</span></div>';
  if (version) version.textContent = 'Player-benefit release 1.1.0';
  document.title = 'Peterborough Fire Response: Street Shift — Player-Benefit Release';

  // Expose the release identity beside the existing test globals without
  // adding any normal-player debug interface.
  game.playerBenefitRelease = Object.freeze({ version:'1.1.0-player-benefit' });
}
