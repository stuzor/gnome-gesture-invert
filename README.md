# gnome-gesture-invert

Decouples three-finger vertical gesture direction from touchpad scroll
direction in GNOME Shell. Lets you run "Traditional" scrolling while
keeping three-finger-up for the Overview.

Works around [gnome-shell#8787](https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/8787).

## How it works

`swipeTracker.js` reads `natural-scroll` per event:

    if (this._touchpadSettings.get_boolean('natural-scroll'))
        delta = -delta;

Rather than wrapping that call in JS (per-event GJS cost, risks animation
stutter), the extension hands vertical gesture objects a real `Gio.Settings`
on its own one-key schema, mirrored to the inverse of the system value. The
native `get_boolean()` call is unchanged, so per-frame cost versus stock is
zero. Horizontal trackers are left alone.

## Install

    git clone <this repo> ~/git/gnome-gesture-invert
    ln -s ~/git/gnome-gesture-invert \
      ~/.local/share/gnome-shell/extensions/gesture-invert@stuzor
    glib-compile-schemas ~/git/gnome-gesture-invert/schemas/

Log out, back in, then `gnome-extensions enable gesture-invert@stuzor`.

`gschemas.compiled` is gitignored, so a fresh clone needs that
`glib-compile-schemas` run before the extension will enable.

## Porting to a new GNOME release

    grep -rl swipeTracker /usr/lib64/gnome-shell/ /usr/lib/gnome-shell/
    gresource extract <that .so> /org/gnome/shell/ui/swipeTracker.js > /tmp/st.js
    grep -n -e '^export' -e '_touchpadSettings' -e '_touchpadGesture' /tmp/st.js

Confirm: `SwipeTracker` still exported, `_touchpadGesture` still assigned in
`_init`, `natural-scroll` still the only key read from `_touchpadSettings`.
If all three hold, add the version to `shell-version` in metadata.json.

If `swipeTracker` is absent from the shell libs entirely, gesture handling
has moved into mutter's C-side Clutter framework and this approach is dead.

## Known issues

`_discover()` walks the object graph to catch trackers that exist before
`enable()`. Fragile; needs replacing with an explicit tracker list before
submitting to extensions.gnome.org. Should also use `InjectionManager`
instead of manual prototype save/restore.

## Tested

GNOME Shell 50.3 (CachyOS), 51.1 (Fedora 45)

## License

GPL-2.0-or-later
