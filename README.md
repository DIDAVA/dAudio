# dAudio
**Advanced Audio Object for modern web browsers**

`dAudio` is an advanced audio object completely based on `Web Audio API` and follows high quality audio engineering standards & rules in it's functionality. Some unique advanced features are available in `dAudio` such as `Smart Audio Remaster`, community standard features like `12 Bands Standard Equalizer` and additional useful features for easier web application development.

## Smart Audio Remaster
Have you ever experienced a playlist of your favorite songs from different decades? When you listen to your songs you will discover that some audio tracks are louder and some are not. In this case you have to play with the volume control and adjust it yourself for each track. `dAudio` tries to solve this issue and adjusts the output sound automatically by it's built in `Smart Audio Remaster` techniques. **" dAudio plays everything LOUD! "**

## Features
* Smart Audio Remaster
* 12 Band Standard Equalizer
* Powerful State Callbacks

## Get Started
`dAudio` constructor receives an object to setup properly.
```javascript
const audio = new dAudio({
  src: 'your_sound_file.mp3', // Audio source file to play.
  remaster: true, // Turn the audio smart remaster functionality on or off.
  repeat: true, // Repeat the audio track when it ends.
  autoplay: true // Play the sound track immediately when ready.
});
```
**Note:** You can change these properties after construction.

### Methods
```javascript
audio.play(); // Starts playing audio track
audio.pause(); // Pauses the playback
audio.stop(); // Stops the playback
audio.playPause(); // Toggles between Play and Pause methods
```

### Properties
#### src
Gets or sets the current audio source. Accepts `URL` or `Blob`.
```javascript
let fileName = audio.src; // Gets the current file name (for Blobs) or URL
```
URL Source
```javascript
audio.src = 'http://www.your-domain.com/audio.mp3'; // Sets the source from URL
```
Blob Source
```html
<input type="file" id="fileInput">
<script>
  document.querySelector('#fileInput').onchange = e => {
    if (e.target.files.length) audio.src = e.target.files[0];
  };
</script>
```