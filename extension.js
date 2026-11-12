// Gesture Direction Invert
//
// Works around gnome-shell issue #8787: the touchpad `natural-scroll` key
// drives BOTH two-finger scroll direction and three-finger gesture direction,
// with no way to separate them. Setting scroll to "Traditional" therefore
// flips the Overview gesture from three-finger-up to three-finger-down.
//
// swipeTracker.js reads that key per event:
//
//     if (this._touchpadSettings.get_boolean('natural-scroll'))
//         delta = -delta;
//
// Rather than wrap that call in JS (which would add a GJS-side call to every
// touchpad event and risk stuttering the animation), we hand the gesture
// object a REAL Gio.Settings on our own one-key schema, mirrored to the
// inverse of the system value. The native get_boolean() call is unchanged,
// so the per-event and per-frame cost versus stock gnome-shell is zero.
//
// Only VERTICAL trackers are swapped -- horizontal workspace switching is
// already correct under traditional scrolling.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {SwipeTracker} from 'resource:///org/gnome/shell/ui/swipeTracker.js';

const TOUCHPAD_SCHEMA = 'org.gnome.desktop.peripherals.touchpad';
const MAX_DEPTH = 6;

export default class GestureInvertExtension extends Extension {
    enable() {
        this._shim = this.getSettings();
        this._real = new Gio.Settings({schema_id: TOUCHPAD_SCHEMA});
        this._patched = new Set();

        this._sync();
        this._changedId = this._real.connect(
            'changed::natural-scroll', () => this._sync());

        // Catch trackers created after us.
        const originalInit = SwipeTracker.prototype._init;
        this._originalInit = originalInit;
        const self = this;
        SwipeTracker.prototype._init = function (...args) {
            originalInit.apply(this, args);
            self._swap(this._touchpadGesture, this);
        };

        // Catch trackers that already exist.
        this._discover();
    }

    disable() {
        if (this._originalInit) {
            SwipeTracker.prototype._init = this._originalInit;
            this._originalInit = null;
        }
        for (const gesture of this._patched ?? []) {
            if (gesture._invertOriginalSettings) {
                gesture._touchpadSettings = gesture._invertOriginalSettings;
                delete gesture._invertOriginalSettings;
            }
        }
        this._patched = null;
        if (this._changedId) {
            this._real.disconnect(this._changedId);
            this._changedId = null;
        }
        this._real = null;
        this._shim = null;
    }

    _sync() {
        this._shim.set_boolean(
            'natural-scroll', !this._real.get_boolean('natural-scroll'));
    }

    _swap(gesture, tracker) {
        if (!gesture?._touchpadSettings || this._patched.has(gesture))
            return;

        let orientation = gesture.orientation;
        if (orientation === undefined || orientation === null)
            orientation = tracker?.orientation;
        if (orientation !== Clutter.Orientation.VERTICAL)
            return;

        gesture._invertOriginalSettings = gesture._touchpadSettings;
        gesture._touchpadSettings = this._shim;
        this._patched.add(gesture);
    }

    // TODO: replace with an explicit list of known trackers before any
    // thought of publishing -- arbitrary graph traversal is fragile and
    // will not survive review.
    _discover() {
        const seen = new Set();
        const queue = [
            Main.overview, Main.wm, Main.panel,
            Main.layoutManager, Main.messageTray,
        ].filter(r => r).map(r => [r, 0]);

        while (queue.length) {
            const [obj, depth] = queue.shift();
            if (!obj || typeof obj !== 'object' ||
                seen.has(obj) || depth > MAX_DEPTH)
                continue;
            seen.add(obj);

            if (obj._touchpadGesture)
                this._swap(obj._touchpadGesture, obj);

            for (const key of Object.keys(obj)) {
                let value;
                try {
                    value = obj[key];
                } catch {
                    continue;
                }
                if (value && typeof value === 'object')
                    queue.push([value, depth + 1]);
            }
        }
    }
}
