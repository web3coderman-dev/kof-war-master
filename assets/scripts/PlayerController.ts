import { _decorator, Component, input, Input, EventKeyboard, KeyCode } from 'cc';
import { SkillAnimation } from './SkillAnimation';
const { ccclass, property } = _decorator;

/**
 * PlayerController.ts
 * 这是一个示例脚本，演示如何控制角色并触发招式动画。
 */
@ccclass('PlayerController')
export class PlayerController extends Component {

    @property(SkillAnimation)
    public skillAnim: SkillAnimation = null!;

    start() {
        if (!this.skillAnim) {
            console.error('PlayerController: SkillAnimation component not assigned!');
            return;
        }

        // 1. 注册动画事件回调
        this.skillAnim.onAttackHit = () => {
            console.log('--- 逻辑层执行：发生攻击碰撞检测！ ---');
            // 这里可以添加伤害计算、粒子效果播放等逻辑
        };

        this.skillAnim.onSkillEnd = () => {
            console.log('--- 逻辑层执行：招式结束，重置角色状态 ---');
            // 这里可以恢复角色的 Idle 状态
        };

        // 2. 注册键盘监听
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);

        console.log('PlayerController started. Press [J] to attack, [K] to pause, [L] to resume.');
    }

    private onKeyDown(event: EventKeyboard) {
        switch (event.keyCode) {
            case KeyCode.KEY_J:
                console.log('Player Input: Trigger Punch Attack!');
                // 设置 1.2 倍速增强打击感
                this.skillAnim.setSpeed(1.2);
                this.skillAnim.play();
                break;

            case KeyCode.KEY_K:
                console.log('Player Input: Pause Animation');
                this.skillAnim.pause();
                break;

            case KeyCode.KEY_L:
                console.log('Player Input: Resume Animation');
                this.skillAnim.resume();
                break;
        }
    }

    onDestroy() {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }
}
