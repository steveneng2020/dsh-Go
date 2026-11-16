/**
 * Composer kit, node half. Pure UI plugin: the empty apply exists so the
 * plugin appears in the host cordis.yml / Loader; the browser half ships via
 * exports["./client"], discovered through the package.json dsh.client
 * declaration.
 *
 * The browser half registers one entry in the `conversation.input.left` seat
 * of the web composer: a compact upload menu (image, file, folder, path) that
 * sits beside the shipped permission and model controls. The shipped `+`
 * button and its full-screen sheet are untouched.
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
function apply() {}

export { apply };
