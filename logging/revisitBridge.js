const PREFIX = '@REVISIT_COMMS';

function createListenerSet() {

  return new Set();

}

function dispatchToListeners( listeners, payload ) {

  for ( const listener of listeners ) {

    listener( payload );

  }

}

export function createRevisitBridge() {

  const iframeId = new URLSearchParams( window.location.search ).get( 'id' );
  const isEnabled = Boolean( iframeId );
  const studyDataListeners = createListenerSet();
  const provenanceListeners = createListenerSet();
  const answersListeners = createListenerSet();
  const analysisControlListeners = createListenerSet();

  function sendMessage( tag, message ) {

    if ( ! isEnabled ) {

      return false;

    }

    window.parent.postMessage( {
      error: false,
      type: `${PREFIX}/${tag}`,
      iframeId,
      message,
    }, '*' );

    return true;

  }

  function addListener( listeners, fn ) {

    listeners.add( fn );
    return () => listeners.delete( fn );

  }

  function handleMessage( event ) {

    const { data } = event;

    if ( ! data || typeof data !== 'object' || data.iframeId !== iframeId ) {

      return;

    }

    if ( data.type === `${PREFIX}/STUDY_DATA` ) {

      dispatchToListeners( studyDataListeners, data.message );
      return;

    }

    if ( data.type === `${PREFIX}/PROVENANCE` ) {

      dispatchToListeners( provenanceListeners, data.message );
      return;

    }

    if ( data.type === `${PREFIX}/ANSWERS` ) {

      dispatchToListeners( answersListeners, data.message );
      return;

    }

    if ( data.type === `${PREFIX}/ANALYSIS_CONTROL` ) {

      dispatchToListeners( analysisControlListeners, data.message );

    }

  }

  function announceWindowReady() {

    sendMessage( 'WINDOW_READY' );

  }

  window.addEventListener( 'message', handleMessage );

  if ( document.readyState === 'complete' ) {

    queueMicrotask( announceWindowReady );

  } else {

    window.addEventListener( 'load', announceWindowReady, { once: true } );

  }

  return {
    prefix: PREFIX,
    iframeId,
    isEnabled,
    isStandalone: ! isEnabled,
    postAnswers( answers ) {

      sendMessage( 'ANSWERS', answers );

    },
    postProvenance( provenance ) {

      sendMessage( 'PROVENANCE', provenance );

    },
    postReady() {

      sendMessage( 'READY', {
        documentHeight: document.documentElement.scrollHeight,
        documentWidth: document.documentElement.scrollWidth,
      } );

    },
    onDataReceive( fn ) {

      return addListener( studyDataListeners, fn );

    },
    onProvenanceReceive( fn ) {

      return addListener( provenanceListeners, fn );

    },
    onAnswersReceive( fn ) {

      return addListener( answersListeners, fn );

    },
    onAnalysisControlReceive( fn ) {

      return addListener( analysisControlListeners, fn );

    },
  };

}
