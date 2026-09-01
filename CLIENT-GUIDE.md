# BM FontMixer

BM FontMixer applies the approved Back Market Latin and Japanese font pairings to a selected Figma text layer.

## Before you start

You need:

- The Figma desktop app
- The unzipped `BM-FontMixer` folder
- The BM Duplet DSP font family installed
- The FOT-NewCezanne ProN font family installed

## Install BM FontMixer

You only need to do this once.

1. Download the `BM-FontMixer` ZIP file.
2. Double-click the ZIP file to unzip it.
3. Keep the unzipped `BM-FontMixer` folder somewhere permanent. Do not delete or move it after installation.
4. Open the Figma desktop app and open any Figma Design file.
5. In the top menu, choose **Plugins → Development → Import plugin from manifest…**
6. Open the unzipped `BM-FontMixer` folder and select `manifest.json`.
7. BM FontMixer is now installed as a development plugin.

> Important: Use the **Plugins** menu, not the **Widgets** menu. The widget importer will show a `containsWidget` manifest error.

## Use BM FontMixer

1. Select one text layer in Figma.
2. Choose **Plugins → Development → BM FontMixer**.
3. Select a weight:
   - **Regular**: BM Duplet DSP Regular + FOT-NewCezanne ProN M
   - **SemiBold**: BM Duplet DSP SemiBold + FOT-NewCezanne ProN DB
   - **Bold**: BM Duplet DSP Bold + FOT-NewCezanne ProN B
   - **ExtraBold**: BM Duplet DSP ExtraBold + FOT-NewCezanne ProN EB
4. Set the Latin font size. You can choose a preset or type a number.
5. Adjust **Size difference** if needed. The default is `-5%`, so Japanese text is 5% smaller than Latin text.
6. Click **Apply**.

BM FontMixer automatically uses these letter-spacing values:

- Latin: `0em`
- Kanji: `0.04em`
- Hiragana: `0.02em`
- Katakana: `0.02em`

## If something does not work

### A weight button is unavailable

The exact font style for that pairing is not installed. Install the missing BM Duplet DSP or FOT-NewCezanne ProN style, restart Figma, and try again.

BM FontMixer also shows a message below the weight buttons naming any missing font family or style.

### “No layer selected” appears

Select exactly one text layer, then click **Apply** again.

### A `containsWidget` manifest error appears

You used the widget importer. Repeat the installation using **Plugins → Development → Import plugin from manifest…**

### The plugin disappears after moving the folder

Figma loads this development plugin from the unzipped folder. Put the folder back in its original location, or import `manifest.json` again from its new location.

## Privacy

BM FontMixer does not use the internet or upload text. It works locally inside Figma.
