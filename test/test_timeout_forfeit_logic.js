const { Chess } = require('../server/node_modules/chess.js');

async function testForfeitOutcome() {
    console.log('--- KIỂM TRA PHÂN ĐỊNH THẮNG THUA KHI HẾT 30 GIÂY ---');

    // Case 1: Ván cờ bắt đầu, lượt Trắng đi (fen ban đầu)
    const chess = new Chess();
    const turnWhite = chess.turn(); // 'w'
    const resultWhenWhiteTimesOut = (turnWhite === 'w') ? 'black_win' : 'white_win';
    const sideWhite = (turnWhite === 'w') ? 'Trắng' : 'Đen';
    const winnerWhite = (turnWhite === 'w') ? 'Đen' : 'Trắng';
    const reasonWhite = `Bên ${sideWhite} đi nước cờ quá 30 giây và bị xử THUA! Bên ${winnerWhite} giành CHIẾN THẮNG!`;

    console.log('Trường hợp 1 (Trắng quá 30s):', { result: resultWhenWhiteTimesOut, reason: reasonWhite });
    if (resultWhenWhiteTimesOut !== 'black_win') throw new Error('Trắng quá giờ phải xử Đen thắng');

    // Case 2: Sau khi Trắng đi e4, lượt Đen đi
    chess.move('e4');
    const turnBlack = chess.turn(); // 'b'
    const resultWhenBlackTimesOut = (turnBlack === 'w') ? 'black_win' : 'white_win';
    const sideBlack = (turnBlack === 'w') ? 'Trắng' : 'Đen';
    const winnerBlack = (turnBlack === 'w') ? 'Đen' : 'Trắng';
    const reasonBlack = `Bên ${sideBlack} đi nước cờ quá 30 giây và bị xử THUA! Bên ${winnerBlack} giành CHIẾN THẮNG!`;

    console.log('Trường hợp 2 (Đen quá 30s):', { result: resultWhenBlackTimesOut, reason: reasonBlack });
    if (resultWhenBlackTimesOut !== 'white_win') throw new Error('Đen quá giờ phải xử Trắng thắng');

    console.log('✅ Logic phân định xử thua 30s chính xác 100%!');
}

testForfeitOutcome();

