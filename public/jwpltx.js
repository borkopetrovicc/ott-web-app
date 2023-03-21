window.jwpltx = window.jwpltx || {};

(function (o) {
  // Hostname for sending analytics
  const URL = 'https://ihe.jwpltx.com/v1/jwplayer6/ping.gif?';
  // Query parameters for sending analytics
  const URI = {
    pss: '1',
    oos: 'Web',
    oosv: '5',
    sdk: '0',
  };

  // There are anywhere between 1 to 128 quantiles in any given video, 128 is max for every video
  const MAX_DURATION_IN_QUANTILES = 128;
  // query params instance.
  let uri;
  // Time watched after last t event was sent
  let timeWatched = 0;
  // Last progress of the video stored
  let lastVp = 0;
  // Last quantile reached
  let lastQ;
  // Seeking state, gets reset after 1 sec of the latest seeked event
  let isSeeking = null;
  // Timeout for seeking state
  let liveInterval = null;

  // How many quantiles have we passed (whether we need to send new t event or not)
  function getLastVODQuantile(progress, duration, numberOfQuantiles) {
    return Math.floor(progress / (duration / numberOfQuantiles));
  }

  // Here we convert seconds watched to the unites accepted by analytics service (res is 0 - 128)
  function getProgressWatched(progress, duration) {
    return Math.floor(MAX_DURATION_IN_QUANTILES * (progress / duration));
  }

  // We set interval for sending t events for live streams where we can't get progress info
  function setLiveInterval() {
    liveInterval = setInterval(() => {
      timeWatched += 1;
    }, 1000);
  }

  // We clear interval after complete or when seeking
  function clearLiveInterval() {
    clearInterval(liveInterval);
    liveInterval = null;
  }

  // Process a player ready event
  o.ready = function (aid, bun, fed, id, t) {
    uri = JSON.parse(JSON.stringify(URI));
    uri.aid = aid;
    uri.bun = bun;
    uri.fed = fed;
    uri.id = id;
    uri.t = t;

    uri.emi = generateId(12);
    uri.pli = generateId(12);
    sendData('e');
  };

  // Process an ad impression event
  o.adImpression = function () {
    sendData('i');
  };

  // Process seek event
  o.seek = function (offset, duration) {
    isSeeking = true;
    // Clear interval in case of a live stream not to update time watched while seeking
    if (uri.pw === -1) {
      clearLiveInterval();
    } else {
      // We need to rewrite progress of the video when seeking to have a valid ti param
      lastVp = offset;
      lastQ = getLastVODQuantile(offset, duration, uri.q);
    }
  };

  // Process seeked event
  o.seeked = function () {
    // There is currently a 1 sec debounce surrounding this event in order to logically group multiple `seeked` events
    window.setTimeout(() => {
      isSeeking = false;
      // Set new timeout when seeked event reached for live events
      if (uri.pw === -1 && !liveInterval) {
        setLiveInterval();
      }
      sendData('vs');
    }, 1000);
  };

  // When player is disconnected from the page -> we send remove event and update analytics with recent playback changes
  o.remove = function () {
    if (uri.pw === -1) {
      clearLiveInterval();
    } else {
      const pw = getProgressWatched(lastVp, uri.vd);
      uri.pw = pw;
    }

    uri.ti = Math.floor(timeWatched);
    timeWatched = 0;

    sendData('t');
  };

  // Process a time tick event
  o.time = function (vp, vd) {
    if (isSeeking) {
      return;
    }

    // 0 or negative vd means live stream
    if (vd < 1) {
      // Initial tick means play() event
      if (!uri.pw) {
        uri.vd = 0;
        uri.q = 0;
        uri.pw = -1;

        sendData('s');
        setLiveInterval();
        // monitor ticks for 20s elapsed
      } else {
        if (timeWatched > 19) {
          uri.ti = timeWatched;
          timeWatched = 0;
          sendData('t');
        }
      }

      // positive vd means  VOD stream
    } else {
      // Initial tick means play() event
      if (!uri.vd) {
        uri.vd = Math.round(vd);
        if (vd < 30) {
          uri.q = 1;
        } else if (vd < 60) {
          uri.q = 4;
        } else if (vd < 180) {
          uri.q = 8;
        } else if (vd < 300) {
          uri.q = 16;
        } else {
          uri.q = 32;
        }

        uri.ti = 0;
        uri.pw = 0;

        // Initialize latest quantile to compare further quantiles with
        lastQ = getLastVODQuantile(vp, vd, uri.q);
        // Initial values to compare watched progress
        lastVp = vp;

        sendData('s');
        // monitor ticks for entering new quantile
      } else {
        const pw = getProgressWatched(vp, vd);
        const passedQ = getLastVODQuantile(vp, vd, uri.q);

        // Total time watched since last t event.
        timeWatched = timeWatched + (vp - lastVp);
        lastVp = vp;

        if (passedQ > lastQ) {
          uri.ti = Math.floor(timeWatched);
          uri.pw = pw;

          sendData('t');

          lastQ = passedQ;
          timeWatched = 0;
        }
      }
    }
  };

  // Process a video complete events
  o.complete = function () {
    // Clear intervals for live streams
    if (uri.pw === -1) {
      clearLiveInterval();
    } else {
      uri.pw = MAX_DURATION_IN_QUANTILES;
    }

    uri.ti = Math.floor(timeWatched);
    timeWatched = 0;

    sendData('t');
  };

  // Helper function to generate IDs
  function generateId(len) {
    let arr = new Uint8Array((len || 40) / 2);
    window.crypto.getRandomValues(arr);
    return Array.from(arr, dec2hex).join('');
  }

  function dec2hex(dec) {
    return dec.toString(16).padStart(2, '0');
  }

  // Serialize and send data to JW Player
  function sendData(type) {
    uri.e = type;
    uri.sa = Date.now();
    // Serialize data
    let str = '';
    for (let key in uri) {
      if (uri[key] !== null) {
        str == '' ? null : (str += '&');
        str += key + '=' + encodeURIComponent(uri[key]);
      }
    }
    // Ads are sent to special bucket
    let url = URL;
    if (uri.e == 'i') {
      url = URL.replace('jwplayer6', 'clienta');
    }
    // Send data if analytics token is set
    if (uri.aid) {
      navigator.sendBeacon(url + str);
    } else {
      // eslint-disable-next-line no-console
      console.log(url + str);
    }
  }

  // Send the rest of the data and cancel possible intervals in case a web page is closed while watching
  window.addEventListener('beforeunload', () => {
    clearLiveInterval();
    if (timeWatched) {
      uri.ti = Math.floor(timeWatched);
      sendData('t');
    }
  });
})(window.jwpltx);
