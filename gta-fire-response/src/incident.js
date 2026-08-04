import { GAME_STATES } from './config.js';
import { angleDifference, bearing, clamp, meters, pointFrom } from './math.js';

export class IncidentController {
  constructor(game) {
    this.game = game;
    this.call = null;
    this.stage = 'idle';
    this.tool = 'none';
    this.compartmentOpen = false;
    this.fireIntensity = 100;
    this.extinguisherCapacity = 100;
    this.fireControlledAt = 0;
  }

  start(call) {
    this.resetVisuals();
    this.call = call;
    this.stage = 'dispatched';
    this.tool = 'none';
    this.compartmentOpen = false;
    this.fireIntensity = call.type.includes('fire') ? 100 : 65;
    this.extinguisherCapacity = 100;
    this.game.renderer.showIncident(call);
    this.game.renderer.setFireIntensity(this.fireIntensity);
  }

  arrive() {
    this.stage = 'apparatus-positioning';
    this.game.ui.setObjective('Stop near the address, exit and open the rear equipment compartment.');
  }

  onExitTruck() {
    if (!this.call) return;
    this.stage = 'equipment';
    this.game.state.transition(GAME_STATES.ON_SCENE, 'player-exited-at-scene');
    this.game.ui.setObjective('Go to the rear of Engine 1 and open the equipment compartment.');
  }

  rearCompartmentPoint() {
    return pointFrom(this.game.truck, this.game.truck.heading + 180, 5.1);
  }

  promptFor(player) {
    if (!this.call || this.game.state.current !== GAME_STATES.ON_SCENE) return null;
    const rear = this.rearCompartmentPoint();
    if ((this.stage === 'equipment' || this.stage === 'select-tool') && meters(player, rear) < 6.5) {
      return { id: 'compartment', text: this.compartmentOpen ? 'Choose hose or extinguisher' : 'Open equipment compartment', key: 'E' };
    }
    if (this.tool !== 'none') {
      const distanceToFire = meters(player, this.call);
      if (this.tool === 'hose' && meters(player, this.game.truck) > 55) return { id: 'hose-too-far', text: 'Hose limit reached — move toward Engine 1', key: '!' };
      if (distanceToFire < (this.tool === 'hose' ? 27 : 12)) return { id: 'attack', text: `Hold action and aim at the fire`, key: 'HOLD' };
      return { id: 'approach', text: `Move closer with the ${this.tool === 'hose' ? 'attack line' : 'extinguisher'}`, key: 'MOVE' };
    }
    return null;
  }

  interact(player) {
    const prompt = this.promptFor(player);
    if (!prompt) return false;
    if (prompt.id === 'compartment') {
      this.compartmentOpen = true;
      this.stage = 'select-tool';
      this.game.ui.showToolSelector(true);
      this.game.ui.setObjective('Select an attack line or extinguisher from the compartment.');
      return true;
    }
    return false;
  }

  selectTool(tool) {
    if (!this.compartmentOpen || !['hose', 'extinguisher'].includes(tool)) return false;
    this.tool = tool;
    this.stage = 'attack';
    this.game.ui.showToolSelector(false);
    this.game.ui.setTool(tool, tool === 'extinguisher' ? this.extinguisherCapacity : null);
    this.game.ui.setObjective(tool === 'hose' ? 'Advance the line, aim and hold action to flow water.' : 'Approach the fire, aim and hold action to discharge.');
    return true;
  }

  update(dt, input) {
    if (!this.call || this.game.state.current !== GAME_STATES.ON_SCENE || this.tool === 'none') {
      this.game.renderer.setStream(this.game.player, this.game.player, false);
      this.game.renderer.setHose(this.game.truck, this.game.player, false);
      return;
    }

    const player = this.game.player;
    const maxHose = 55;
    const hoseValid = this.tool !== 'hose' || meters(player, this.game.truck) <= maxHose;
    this.game.renderer.setHose(this.game.truck, player, this.tool === 'hose');

    const range = this.tool === 'hose' ? 26 : 10.5;
    const aimEnd = pointFrom(player, player.heading, range);
    const fireBearing = bearing(player, this.call);
    const aimDifference = Math.abs(angleDifference(player.heading, fireBearing));
    const fireDistance = meters(player, this.call);
    const inRange = fireDistance <= range + 2;
    const hasCapacity = this.tool !== 'extinguisher' || this.extinguisherCapacity > 0;
    const flowing = input.actionHeld && hoseValid && inRange && aimDifference < (this.tool === 'hose' ? 20 : 30) && hasCapacity;

    this.game.renderer.setStream(player, aimEnd, input.actionHeld && hoseValid && hasCapacity, this.tool);
    if (flowing) {
      const suppression = this.tool === 'hose' ? 31 : 22;
      this.fireIntensity = clamp(this.fireIntensity - suppression * dt, 0, 100);
      if (this.tool === 'extinguisher') this.extinguisherCapacity = clamp(this.extinguisherCapacity - 17 * dt, 0, 100);
      this.game.ui.pulseFeedback('Effective stream');
    } else if (this.fireIntensity > 0 && this.fireIntensity < 96) {
      this.fireIntensity = clamp(this.fireIntensity + 2.1 * dt, 0, 100);
    }

    this.game.renderer.setFireIntensity(this.fireIntensity);
    this.game.ui.setFireStatus(this.fireIntensity, this.tool === 'extinguisher' ? this.extinguisherCapacity : null);

    if (this.fireIntensity <= 0 && this.stage !== 'controlled') {
      this.stage = 'controlled';
      this.fireControlledAt = performance.now();
      this.game.renderer.setStream(player, aimEnd, false);
      this.game.completeCall('Fire controlled');
    }
  }

  resetVisuals() {
    this.game?.renderer?.setHose?.({}, {}, false);
    this.game?.renderer?.setStream?.({}, {}, false);
    this.game?.ui?.showToolSelector?.(false);
  }

  reset() {
    this.resetVisuals();
    this.call = null;
    this.stage = 'idle';
    this.tool = 'none';
    this.compartmentOpen = false;
    this.fireIntensity = 100;
    this.extinguisherCapacity = 100;
  }
}
