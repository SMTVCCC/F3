class ChatApp {
    constructor() {
        this.peer = null;
        this.connection = null;
        this.connectionCode = '';
        this.userId = this.generateUserId();
        this.partnerConnected = false;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // 初始按钮事件监听
        document.getElementById('createChatBtn').addEventListener('click', () => {
            document.getElementById('initialButtons').style.display = 'none';
            document.getElementById('connectionCodeDisplay').style.display = 'block';
            this.setupPeer();
        });

        document.getElementById('joinChatBtn').addEventListener('click', () => {
            document.getElementById('initialButtons').style.display = 'none';
            document.getElementById('connectionForm').style.display = 'block';
            this.setupPeer();
        });

        document.getElementById('connectBtn').addEventListener('click', () => this.connect());
        document.getElementById('disconnectBtn').addEventListener('click', () => this.disconnect());
        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // 添加双击复制连接码功能
        document.getElementById('codeDisplay').addEventListener('dblclick', (e) => {
            const code = e.target.textContent;
            if (code) {
                navigator.clipboard.writeText(code)
                    .then(() => {
                        alert('连接码已复制到剪贴板');
                    })
                    .catch(err => {
                        console.error('复制失败:', err);
                        alert('复制失败，请手动复制');
                    });
            }
        });
    }

    setupPeer() {
        try {
            this.peer = new Peer(this.userId);
            
            this.peer.on('connection', (conn) => {
                this.connection = conn;
                this.setupConnection(conn);
                // 当收到连接请求时，自动进入聊天界面
                document.getElementById('connectionPanel').style.display = 'none';
                document.getElementById('chatContainer').style.display = 'block';
                document.getElementById('partnerStatus').textContent = '对方已连接';
                document.getElementById('partnerStatus').style.color = '#2ecc71';
            });

            this.peer.on('error', (err) => {
                console.error('PeerJS错误:', err);
                if (err.type === 'peer-unavailable') {
                    alert('无法找到对方，请确认连接码是否正确');
                } else if (err.type === 'disconnected') {
                    alert('连接已断开，正在尝试重新连接...');
                    this.reconnect();
                } else {
                    alert('连接出错，请重试');
                    this.disconnect();
                }
            });

            this.peer.on('open', (id) => {
                console.log('已生成连接码:', id);
                document.getElementById('codeDisplay').textContent = id;
            });

            this.peer.on('disconnected', () => {
                console.log('与服务器断开连接，尝试重连...');
                this.reconnect();
            });

            this.peer.on('close', () => {
                console.log('连接已关闭');
                this.disconnect();
            });
        } catch (error) {
            console.error('PeerJS初始化错误:', error);
            alert('初始化连接失败，请刷新页面重试');
        }
    }

    generateUserId() {
        return Math.random().toString(36).substring(2, 10);
    }

    connect() {
        const codeInput = document.getElementById('connectionCode');
        this.connectionCode = codeInput.value.trim();
        
        if (!this.connectionCode) {
            alert('请输入对方的连接码！');
            return;
        }

        // 如果连接码是自己的，不允许连接
        if (this.connectionCode === this.userId) {
            alert('不能连接自己的连接码！');
            return;
        }

        const connectBtn = document.getElementById('connectBtn');
        connectBtn.disabled = true;
        connectBtn.textContent = '连接中...';

        try {
            this.connection = this.peer.connect(this.connectionCode);
            this.setupConnection(this.connection);

            // 更新UI
            document.getElementById('connectionPanel').style.display = 'none';
            document.getElementById('chatContainer').style.display = 'block';
            document.getElementById('partnerStatus').textContent = '等待对方连接...';
            document.getElementById('partnerStatus').style.color = '#f39c12';
        } catch (error) {
            console.error('连接失败:', error);
            alert('创建连接失败，请重试');
            this.disconnect();
        }
    }

    setupConnection(conn) {
        conn.on('open', () => {
            console.log('连接已打开');
            this.updatePartnerStatus(true);
            // 发送一个心跳包确认连接
            conn.send('__ping__');
        });

        conn.on('close', () => {
            console.log('连接已关闭');
            this.updatePartnerStatus(false);
            // 尝试重新连接
            this.reconnect();
        });

        conn.on('error', (err) => {
            console.error('连接错误:', err);
            this.updatePartnerStatus(false);
            this.reconnect();
        });

        conn.on('data', (data) => {
            if (data === '__ping__') {
                conn.send('__pong__');
                return;
            }
            if (data === '__pong__') return;
            this.displayMessage(data, false);
        });
    }
    
    updatePartnerStatus(isConnected) {
        this.partnerConnected = isConnected;
        const statusElement = document.getElementById('partnerStatus');
        
        if (isConnected) {
            statusElement.textContent = '对方已连接';
            statusElement.style.color = '#2ecc71';
        } else {
            statusElement.textContent = '对方已断开';
            statusElement.style.color = '#e74c3c';
        }
    }

    sendMessage() {
        const input = document.getElementById('messageInput');
        const message = input.value.trim();
        
        if (!message) return;
        
        if (this.connection && this.connection.open) {
            this.connection.send(message);
            this.displayMessage(message, true);
            input.value = '';
        }
    }

    displayMessage(message, isSent) {
        const messagesContainer = document.getElementById('messagesContainer');
        const messageElement = document.createElement('div');
        messageElement.className = `message ${isSent ? 'sent' : 'received'}`;
        messageElement.textContent = message;
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    disconnect() {
        if (this.connection) {
            this.connection.close();
        }
        if (this.peer) {
            this.peer.disconnect();
        }
        
        this.connection = null;
        this.peer = null;
        this.partnerConnected = false;
        
        document.getElementById('connectionPanel').style.display = 'block';
        document.getElementById('chatContainer').style.display = 'none';
        document.getElementById('messagesContainer').innerHTML = '';
        document.getElementById('messageInput').value = '';
        
        const connectBtn = document.getElementById('connectBtn');
        connectBtn.disabled = false;
        connectBtn.textContent = '连接';
    }

    reconnect() {
        if (!this.connectionCode) return;
        
        console.log('尝试重新连接...');
        document.getElementById('partnerStatus').textContent = '正在重新连接...';
        document.getElementById('partnerStatus').style.color = '#f39c12';

        if (this.peer && this.peer.disconnected) {
            this.peer.reconnect();
        }

        // 5秒后如果还没有连接成功，就重新初始化连接
        setTimeout(() => {
            if (!this.partnerConnected) {
                this.setupPeer();
                this.connect();
            }
        }, 5000);
    }
}

// 初始化应用
window.addEventListener('load', () => {
    new ChatApp();
});