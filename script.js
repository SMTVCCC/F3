class ChatApp {
    constructor() {
        this.peer = null;
        this.connection = null;
        this.connectionCode = '';
        this.userId = this.generateUserId();
        this.partnerConnected = false;
        this.connections = new Map(); // 用于存储群聊的所有连接
        this.isGroupChat = false; // 标记是否为群聊模式
        this.username = ''; // 用户名
        this.setupEventListeners();
    }

    setupEventListeners() {
        // 初始按钮事件监听
        document.getElementById('createChatBtn').addEventListener('click', () => {
            document.getElementById('initialButtons').style.display = 'none';
            document.getElementById('connectionCodeDisplay').style.display = 'block';
            this.isGroupChat = false;
            this.setupPeer();
        });

        document.getElementById('joinChatBtn').addEventListener('click', () => {
            document.getElementById('initialButtons').style.display = 'none';
            document.getElementById('connectionForm').style.display = 'block';
            this.isGroupChat = false;
            this.setupPeer();
        });

        document.getElementById('groupChatBtn').addEventListener('click', () => {
            document.getElementById('initialButtons').style.display = 'none';
            document.getElementById('connectionCodeDisplay').style.display = 'block';
            document.getElementById('setNameBtn').style.display = 'block'; // 显示名字设置按钮
            this.isGroupChat = true;
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

        // 添加名字设置按钮事件
        document.getElementById('setNameBtn').addEventListener('click', () => {
            const newName = prompt('请输入您的名字：', this.username);
            if (newName && newName.trim()) {
                this.username = newName.trim();
                // 广播用户名更改
                if (this.isGroupChat) {
                    this.broadcastToGroup('', null, 'name_change');
                }
            }
        });
    }

    setupPeer() {
        try {
            this.peer = new Peer(this.userId);
            
            this.peer.on('connection', (conn) => {
                if (this.isGroupChat) {
                    // 群聊模式：允许多个连接
                    this.setupGroupConnection(conn);
                } else {
                    // 一对一聊天模式
                    this.connection = conn;
                    this.setupConnection(conn);
                }
                document.getElementById('connectionPanel').style.display = 'none';
                document.getElementById('chatContainer').style.display = 'block';
                document.getElementById('partnerStatus').textContent = this.isGroupChat ? '群聊已连接' : '对方已连接';
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

    setupConnection(conn) {
        conn.on('open', () => {
            console.log('连接已打开');
            this.updatePartnerStatus(true);
            // 发送一个心跳包确认连接
            conn.send({
                type: 'ping',
                message: '__ping__'
            });
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
            if (data.type === 'ping' && data.message === '__ping__') {
                conn.send({
                    type: 'pong',
                    message: '__pong__'
                });
                return;
            }
            if (data.type === 'pong' && data.message === '__pong__') return;
            
            if (data.type === 'message') {
                this.displayMessage(data.message, false);
            }
        });
    }

    setupGroupConnection(conn) {
        conn.on('open', () => {
            console.log('群聊连接已打开:', conn.peer);
            this.connections.set(conn.peer, {
                connection: conn,
                username: ''
            });
            this.updateGroupStatus();
            // 显示名字设置按钮（无论是创建者还是加入者）
            document.getElementById('setNameBtn').style.display = 'block';
            conn.send({
                type: 'system',
                message: '新成员加入群聊'
            });
            // 发送自己的用户名
            if (this.username) {
                conn.send({
                    type: 'name_change',
                    userId: this.userId,
                    username: this.username
                });
            }
        });

        conn.on('close', () => {
            console.log('群聊连接已关闭:', conn.peer);
            this.connections.delete(conn.peer);
            this.updateGroupStatus();
            this.displayMessage(`用户 ${this.getDisplayName(conn.peer)} 已离开群聊`, 'system');
        });

        conn.on('error', (err) => {
            console.error('群聊连接错误:', err);
            this.connections.delete(conn.peer);
            this.updateGroupStatus();
        });

        conn.on('data', (data) => {
            if (data.type === 'system') {
                this.displayMessage(data.message, 'system');
            } else if (data.type === 'name_change') {
                // 更新用户名
                if (this.connections.has(data.userId)) {
                    this.connections.get(data.userId).username = data.username;
                }
            } else if (data.type === 'message') {
                const senderName = this.getDisplayName(conn.peer);
                this.displayMessage(data.message, false, senderName);
                // 转发消息给其他群聊成员
                this.broadcastToGroup(data.message, conn.peer);
            }
        });
    }

    getDisplayName(userId) {
        if (userId === this.userId) {
            return this.username || '我';
        }
        const peer = this.connections.get(userId);
        return peer && peer.username ? peer.username : userId.substring(0, 6);
    }

    updateGroupStatus() {
        const statusElement = document.getElementById('partnerStatus');
        const count = this.connections.size;
        statusElement.textContent = `群聊成员数: ${count + 1}`; // +1 包括自己
        statusElement.style.color = count > 0 ? '#2ecc71' : '#e74c3c';
    }

    broadcastToGroup(message, excludePeer = null, type = 'message') {
        const data = {
            type: type,
            message: message
        };

        if (type === 'name_change') {
            data.userId = this.userId;
            data.username = this.username;
        }

        this.connections.forEach((peer, peerId) => {
            if (peerId !== excludePeer && peer.connection.open) {
                peer.connection.send(data);
            }
        });
    }

    connect() {
        const codeInput = document.getElementById('connectionCode');
        this.connectionCode = codeInput.value.trim();
        
        if (!this.connectionCode) {
            alert('请输入连接码！');
            return;
        }

        if (this.connectionCode === this.userId) {
            alert('不能连接自己的连接码！');
            return;
        }

        const connectBtn = document.getElementById('connectBtn');
        connectBtn.disabled = true;
        connectBtn.textContent = '连接中...';

        try {
            if (this.isGroupChat) {
                // 群聊模式：建立新连接
                const conn = this.peer.connect(this.connectionCode);
                this.setupGroupConnection(conn);
                // 显示名字设置按钮
                document.getElementById('setNameBtn').style.display = 'block';
                document.getElementById('connectionPanel').style.display = 'none';
                document.getElementById('chatContainer').style.display = 'block';
            } else {
                // 一对一聊天模式
                this.connection = this.peer.connect(this.connectionCode);
                this.setupConnection(this.connection);
                // 隐藏名字设置按钮
                document.getElementById('setNameBtn').style.display = 'none';
                document.getElementById('connectionPanel').style.display = 'none';
                document.getElementById('chatContainer').style.display = 'block';
            }

            document.getElementById('partnerStatus').textContent = this.isGroupChat ? '等待群聊成员加入...' : '等待对方连接...';
            document.getElementById('partnerStatus').style.color = '#f39c12';
        } catch (error) {
            console.error('连接失败:', error);
            alert('创建连接失败，请重试');
            this.disconnect();
        }
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
        
        if (this.isGroupChat) {
            // 群聊模式：向所有连接发送消息
            const messageData = {
                type: 'message',
                message: message,
                userId: this.userId,
                username: this.username || '我'
            };
            
            // 显示自己的消息
            this.displayMessage(message, true, this.username || '我');
            
            // 发送给其他人
            this.connections.forEach((peer) => {
                if (peer.connection.open) {
                    peer.connection.send(messageData);
                }
            });
        } else if (this.connection && this.connection.open) {
            // 一对一聊天模式
            this.connection.send({
                type: 'message',
                message: message
            });
            this.displayMessage(message, true);
        }
        input.value = '';
    }

    displayMessage(message, type, username = null) {
        const messagesContainer = document.getElementById('messagesContainer');
        const messageElement = document.createElement('div');
        
        if (type === 'system') {
            messageElement.className = 'message system';
            messageElement.style.textAlign = 'center';
            messageElement.style.color = '#666';
            messageElement.style.fontStyle = 'italic';
            messageElement.textContent = message;
        } else {
            messageElement.className = `message ${type === true ? 'sent' : 'received'}`;
            messageElement.textContent = message;
            
            if (username && this.isGroupChat) {
                const usernameElement = document.createElement('span');
                usernameElement.className = 'username';
                usernameElement.textContent = username;
                messageElement.appendChild(usernameElement);
            }
        }
        
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    disconnect() {
        if (this.isGroupChat) {
            // 群聊模式：关闭所有连接
            this.connections.forEach(conn => conn.connection.close());
            this.connections.clear();
        } else if (this.connection) {
            // 一对一聊天模式
            this.connection.close();
            this.connection = null;
        }
        
        if (this.peer) {
            this.peer.disconnect();
        }
        
        this.peer = null;
        this.partnerConnected = false;
        this.isGroupChat = false;
        
        document.getElementById('connectionPanel').style.display = 'block';
        document.getElementById('chatContainer').style.display = 'none';
        document.getElementById('messagesContainer').innerHTML = '';
        document.getElementById('messageInput').value = '';
        document.getElementById('initialButtons').style.display = 'flex';
        document.getElementById('connectionForm').style.display = 'none';
        document.getElementById('connectionCodeDisplay').style.display = 'none';
        
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