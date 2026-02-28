(function () {
    let socket;
    let syncAction;
    let authAction;
    let reconnectTimeout;

    // Track the active uploading dialog so we can close it when Synthetic Selection replies
    let uploadingDialog;
    let reconnectDisabled = false;

    Plugin.register('synthetic_selection', {
        title: 'Synthetic Selection Sync',
        author: 'SS Team',
        description: 'Syncs Blockbench models directly to the Synthetic Selection Engine.',
        icon: 'sync',
        version: '1.0.0',
        variant: 'both',
        onload() {
            // Action to set the Auth Token
            authAction = new Action('ss_set_token', {
                name: 'Connect to Synthetic Selection',
                description: 'Set your Authentication Token to connect to the game',
                icon: 'vpn_key',
                click: function () {
                    let currentToken = localStorage.getItem('ss_auth_token') || '';

                    let authDialog = new Dialog({
                        id: 'ss_auth_dialog',
                        title: 'Connect to Synthetic Selection',
                        form: {
                            token: { label: 'Authentication Token', type: 'password', value: currentToken }
                        },
                        onConfirm: function (formData) {
                            let token = formData.token;
                            if (token) {
                                localStorage.setItem('ss_auth_token', token);
                                Blockbench.showQuickMessage('Token Saved');
                                connectWebSocket(token);
                            }
                            this.hide();
                        }
                    });

                    authDialog.show();
                }
            });

            // Action to Synchronize Model
            syncAction = new Action('ss_sync_model', {
                name: 'Sync to Game',
                description: 'Push current model data to Synthetic Selection',
                icon: 'send',
                keybind: new Keybind({ key: 83, ctrl: true, alt: true }), // Key 83 is 'S'
                click: function () {
                    synchronizeModel();
                }
            });

            // Add to Menu
            MenuBar.addAction(authAction, 'tools');
            MenuBar.addAction(syncAction, 'tools');

            // Attempt auto-connect if token exists
            let savedToken = localStorage.getItem('ss_auth_token');
            if (savedToken) {
                connectWebSocket(savedToken);
            }
        },
        onunload() {
            authAction.delete();
            syncAction.delete();
            if (socket) {
                socket.onclose = null;
                socket.close();
            }
            clearTimeout(reconnectTimeout);
        }
    });

    function connectWebSocket(token) {
        if (socket) {
            console.log('SS_SYNC: Closing existing socket...');
            socket.onclose = null;
            socket.close();
        }

        reconnectDisabled = false;
        console.log('SS_SYNC: Attempting to connect to Synthetic Selection on ws://127.0.0.1:8764/blockbench ...');
        socket = new WebSocket('ws://127.0.0.1:8764/blockbench');

        socket.onopen = function () {
            console.log('SS_SYNC: WebSocket Open! Sending Authenticate payload...');
            let authPayload = {
                type: 'Authenticate',
                data: { token: token }
            };
            socket.send(JSON.stringify(authPayload));
        };

        socket.onclose = function (e) {
            console.warn(`SS_SYNC: WebSocket Closed. Code: ${e.code}, Reason: ${e.reason}`);
            if (reconnectDisabled) {
                console.log('SS_SYNC: Reconnect disabled due to Auth failure.');
                return;
            }
            // Auto-reconnect loop
            clearTimeout(reconnectTimeout);
            console.log('SS_SYNC: Scheduling reconnect in 3s...');
            reconnectTimeout = setTimeout(() => {
                connectWebSocket(token);
            }, 3000);
        };

        socket.onerror = function (error) {
            console.error('SS_SYNC: WebSocket Error detected:', error);
        };

        socket.onmessage = function (e) {
            try {
                let msg = JSON.parse(e.data);
                console.log('Message from SS:', msg);

                if (msg.type === 'Authenticated') {
                    Blockbench.showStatusMessage('Connected to Synthetic Selection', 3000);
                } else if (msg.type === 'SyncSuccess') {
                    if (uploadingDialog) uploadingDialog.hide();
                    Blockbench.showQuickMessage('Sync Successful: ' + msg.modelName, 3000);
                } else if (msg.type === 'Error') {
                    if (uploadingDialog) uploadingDialog.hide();

                    if (msg.errorType === 'InvalidToken') {
                        reconnectDisabled = true;
                        clearTimeout(reconnectTimeout);

                        Blockbench.showMessageBox({
                            title: 'Invalid Auth Token',
                            message: 'Synthetic Selection rejected your Token.\n\nPlease check your token in the In-Game Settings Menu (F10) and update it in Blockbench (Tools -> Connect to Synthetic Selection).',
                            icon: 'error'
                        });
                    } else {
                        Blockbench.showMessageBox({
                            title: 'SS Engine Error',
                            message: 'Synthetic Selection rejected the payload:\n\n' + msg.errorType,
                            icon: 'error'
                        });
                    }
                }
            } catch (err) {
                console.error('Error parsing message from SS', err);
            }
        };
    }

    function synchronizeModel() {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            Blockbench.showMessageBox({
                title: 'Not Connected',
                message: 'You are not currently connected to Synthetic Selection. Please set your token from the In-Game Settings Menu first.',
                icon: 'warning'
            });
            return;
        }

        if (!Project) {
            Blockbench.showMessageBox({
                title: 'No Project',
                message: 'There is no open project to synchronize!',
                icon: 'warning'
            });
            return;
        }

        Blockbench.showStatusMessage('Compiling GLB for Sync...', 2000);

        try {
            // Blockbench's GLTF exporter can be synchronous or return a Promise depending on the version.
            // Wrapping it in Promise.resolve() ensures both work.
            let compileResult = Codecs.gltf.compile({ binary: true });

            Promise.resolve(compileResult).then((content) => {
                if (!content) {
                    throw new Error("GLTF exporter returned undefined.");
                }

                let base64String = '';
                let len = 0;

                // Support both Node.js Buffer (Desktop) and standard Uint8Array (Web)
                if (typeof Buffer !== 'undefined') {
                    let buf = Buffer.from(content);
                    len = buf.length;
                    base64String = buf.toString('base64');
                } else {
                    let bytes = new Uint8Array(content);
                    len = bytes.byteLength;
                    let binaryStr = '';
                    const CHUNK_SIZE = 8192;
                    for (let i = 0; i < len; i += CHUNK_SIZE) {
                        let chunk = bytes.subarray(i, i + CHUNK_SIZE);
                        binaryStr += String.fromCharCode.apply(null, chunk);
                    }
                    base64String = btoa(binaryStr);
                }

                if (len === 0) {
                    throw new Error("Compiled GLB byte length is 0.");
                }

                let payload = {
                    type: 'SynchronizeModel',
                    data: {
                        modelName: Project.name || 'UnnamedModel',
                        modelData: base64String
                    }
                };

                // Pop a dialog to show we are waiting for the engine
                uploadingDialog = new Dialog({
                    title: 'Sending to Engine...',
                    id: 'ss_upload_dialog',
                    lines: [
                        'Sending ' + len + ' bytes of GLB data to Synthetic Selection.',
                        'Waiting for the engine to reply with a success validation...'
                    ]
                }).show();

                socket.send(JSON.stringify(payload));

            }).catch(err => {
                console.error('Failed to resolve compiled GLB for Sync', err);
                if (uploadingDialog) uploadingDialog.hide();
                Blockbench.showMessageBox({
                    title: 'Export Failed',
                    message: 'Could not export GLB data: ' + err.message,
                    icon: 'cancel'
                });
            });

        } catch (err) {
            console.error('Fatal Sync Error', err);
            if (uploadingDialog) uploadingDialog.hide();
            Blockbench.showMessageBox({
                title: 'Sync Failed',
                message: 'A fatal Javascript error occurred: ' + err.message,
                icon: 'cancel'
            });
        }
    }
})();
