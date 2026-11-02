/**
 * Slim Phaser build. Vite aliases the bare 'phaser' import to this file, so the
 * app ships Phaser's core (scenes, images, text, graphics, tweens, input, scale,
 * WebGL + Canvas renderers) plus Container, without physics, sound, spine, 3D
 * or the extra game objects. Types still come from the 'phaser' package.
 *
 * If the game starts using another Phaser feature, require it here the same
 * way Container is added below.
 */
import Phaser from 'phaser/src/phaser-core.js';
import Container from 'phaser/src/gameobjects/container/Container.js';
import 'phaser/src/gameobjects/container/ContainerFactory.js';
import 'phaser/src/gameobjects/container/ContainerCreator.js';

Phaser.GameObjects.Container = Container;

export default Phaser;
