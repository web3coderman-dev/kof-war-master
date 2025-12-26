import { _decorator, Component, Sprite, SpriteFrame, Animation, AnimationClip, animation, Event } from 'cc';
const { ccclass, property } = _decorator;

/**
 * SkillAnimation.ts
 * 这是一个通用的招式动画组件，支持动态创建 AnimationClip，
 * 并支持攻击判定帧回调和动作结束回调。
 */
@ccclass('SkillAnimation')
export class SkillAnimation extends Component {

    @property({ type: [SpriteFrame], tooltip: '动画的所有精灵帧（16帧）' })
    public spriteFrames: SpriteFrame[] = [];

    @property({ tooltip: '动画播放帧率' })
    public frameRate: number = 24;

    @property({ tooltip: '动画名称' })
    public animName: string = 'punch_attack';

    @property({ tooltip: '播放倍速' })
    public playSpeed: number = 1.0;

    @property({ tooltip: '是否循环播放' })
    public isLoop: boolean = false;

    private _animation: Animation = null!;
    private _clip: AnimationClip = null!;

    // 回调函数定义
    public onAttackHit: Function | null = null;
    public onSkillEnd: Function | null = null;

    onLoad() {
        this.initAnimation();
    }

    /**
     * 初始化动画组件和剪辑
     */
    private initAnimation() {
        // 确保节点上有 Sprite 组件
        let sprite = this.getComponent(Sprite);
        if (!sprite) {
            sprite = this.addComponent(Sprite);
        }

        // 确保节点上有 Animation 组件
        this._animation = this.getComponent(Animation);
        if (!this._animation) {
            this._animation = this.addComponent(Animation);
        }

        if (this.spriteFrames.length === 0) {
            console.warn('SkillAnimation: No sprite frames provided!');
            return;
        }

        // 1. 创建动画剪辑 (AnimationClip)
        this._clip = new AnimationClip();
        this._clip.name = this.animName;
        this._clip.duration = this.spriteFrames.length / this.frameRate; // 持续时间
        this._clip.sample = this.frameRate; // 采样率

        // 2. 设置循环模式
        this._clip.wrapMode = this.isLoop ? AnimationClip.WrapMode.Loop : AnimationClip.WrapMode.Normal;

        // 3. 创建动画轨道 (Track)
        // Cocos Creator 3.x 使用轨道系统，这里我们控制 Sprite 的 spriteFrame 属性
        const track = new animation.ObjectTrack();
        track.path = new animation.TrackPath().getComponent(Sprite).toProperty('spriteFrame');
        
        const channel = track.channels()[0];
        const curve = channel.curve;

        // 填充帧数据
        this.spriteFrames.forEach((frame, index) => {
            const time = index / this.frameRate;
            curve.addKeyFrame(time, frame);
        });

        // 将轨道添加到剪辑中
        this._clip.addTrack(track);

        // 4. 实现动画事件绑定 (Animation Events)
        this.setupEvents();

        // 5. 将剪辑添加到动画组件中
        this._animation.defaultClip = this._clip;
        this._animation.addClip(this._clip);
    }

    /**
     * 设置动画事件触发点
     */
    private setupEvents() {
        // 出拳的第 8-10 帧触发攻击判定 (索引从0开始，即 7, 8, 9 帧)
        // 注意：这里为了演示，我们在第 8 帧开始时触发一次回调，代表进入判定区间
        this._clip.events = [
            {
                frame: 8 / this.frameRate,
                funcName: 'triggerAttackHit',
                params: []
            },
            {
                // 收招最后2帧 (15-16帧，索引 14, 15)
                // 在倒数第2帧开始时触发结束回调，或者在最后1帧触发
                frame: 14 / this.frameRate,
                funcName: 'triggerSkillEnd',
                params: []
            }
        ];
    }

    /**
     * 引擎调用的事件函数 - 攻击判定
     */
    protected triggerAttackHit() {
        console.log(`[SkillAnimation] Frame 8-10: onAttackHit triggered!`);
        if (this.onAttackHit) {
            this.onAttackHit();
        }
    }

    /**
     * 引擎调用的事件函数 - 技能结束
     */
    protected triggerSkillEnd() {
        console.log(`[SkillAnimation] Last 2 frames: onSkillEnd triggered!`);
        if (this.onSkillEnd) {
            this.onSkillEnd();
        }
    }

    /**
     * 播放招式
     */
    public play() {
        if (!this._animation) return;
        const state = this._animation.getState(this.animName);
        if (state) {
            state.speed = this.playSpeed;
        }
        this._animation.play(this.animName);
    }

    /**
     * 暂停播放
     */
    public pause() {
        this._animation?.pause();
    }

    /**
     * 恢复播放
     */
    public resume() {
        this._animation?.resume();
    }

    /**
     * 停止播放
     */
    public stop() {
        this._animation?.stop();
    }

    /**
     * 重播招式
     */
    public replay() {
        this.stop();
        this.play();
    }

    /**
     * 动态设置播放速度
     */
    public setSpeed(speed: number) {
        this.playSpeed = speed;
        const state = this._animation.getState(this.animName);
        if (state) {
            state.speed = speed;
        }
    }
}
