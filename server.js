const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 存储连接码和对应的用户
const rooms = {};

// 提供静态文件
app.use(express.static(path.join(__dirname, '/')));

// 处理根路径请求
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// WebSocket连接处理
io.on('connection', (socket) => {
    console.log('用户已连接:', socket.id);
    
    // 用户加入房间
    socket.on('join', (data) => {
        const { code } = data;
        console.log(`用户 ${socket.id} 尝试加入房间 ${code}`);
        
        // 如果房间不存在，创建房间
        if (!rooms[code]) {
            rooms[code] = {
                users: [socket.id]
            };
            socket.join(code);
            console.log(`创建房间 ${code}，用户 ${socket.id} 已加入`);
            socket.emit('waiting');
        } 
        // 如果房间存在且只有一个用户，加入房间
        else if (rooms[code].users.length === 1) {
            rooms[code].users.push(socket.id);
            socket.join(code);
            console.log(`用户 ${socket.id} 已加入房间 ${code}`);
            socket.emit('ready');
            socket.to(code).emit('ready');
        } 
        // 如果房间已满，拒绝加入
        else {
            console.log(`房间 ${code} 已满，拒绝用户 ${socket.id} 加入`);
            socket.emit('full');
        }
    });
    
    // 处理消息转发
    socket.on('message', (data) => {
        const { code, message } = data;
        console.log(`用户 ${socket.id} 在房间 ${code} 发送消息`);
        
        if (rooms[code]) {
            socket.to(code).emit('message', { message });
        }
    });
    
    // 处理用户离开房间
    socket.on('leave', (data) => {
        const { code } = data;
        console.log(`用户 ${socket.id} 主动离开房间 ${code}`);
        
        if (rooms[code]) {
            const index = rooms[code].users.indexOf(socket.id);
            if (index !== -1) {
                rooms[code].users.splice(index, 1);
                socket.leave(code);
                socket.to(code).emit('peer_disconnect');
                
                if (rooms[code].users.length === 0) {
                    delete rooms[code];
                    console.log(`房间 ${code} 已删除`);
                }
            }
        }
    });
    
    // 用户断开连接
    socket.on('disconnect', () => {
        console.log('用户断开连接:', socket.id);
        
        // 从所有房间中移除用户
        for (const code in rooms) {
            const room = rooms[code];
            const index = room.users.indexOf(socket.id);
            
            if (index !== -1) {
                room.users.splice(index, 1);
                console.log(`用户 ${socket.id} 已从房间 ${code} 移除`);
                
                // 通知房间中的其他用户
                socket.to(code).emit('peer_disconnect');
                
                // 如果房间为空，删除房间
                if (room.users.length === 0) {
                    delete rooms[code];
                    console.log(`房间 ${code} 已删除`);
                }
            }
        }
    });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});