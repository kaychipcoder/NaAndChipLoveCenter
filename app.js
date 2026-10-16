import { auth, db, functions } from './firebase.js';

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  getIdTokenResult,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';

import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

import { httpsCallable } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-functions.js';

const $ = (id) => document.getElementById(id);
const awardCoins = httpsCallable(functions, 'awardCoins');

let currentUser = null;
let isAdmin = false;
let stopProfile = null;
let stopHistory = null;
let stopMembers = null;

function message(id, text, error = false) {
  $(id).textContent = text;
  $(id).style.color = error ? '#bd2858' : '#a52d68';
}

function readableError(error) {
  const code = error.code || '';
  if (code === 'auth/invalid-credential')
    return 'Email hoặc mật khẩu không đúng.';
  if (code === 'functions/permission-denied')
    return 'Tài khoản không có quyền admin.';
  if (code === 'functions/failed-precondition')
    return 'Đã đạt giới hạn 4 xu hôm nay.';
  if (code === 'functions/unauthenticated') return 'Vui lòng đăng nhập lại.';
  return error.message || 'Có lỗi xảy ra.';
}

function cleanup() {
  stopProfile?.();
  stopHistory?.();
  stopMembers?.();
  stopProfile = stopHistory = stopMembers = null;
}

function formatDate(timestamp) {
  if (!timestamp?.toDate) return 'Đang cập nhật';
  return timestamp.toDate().toLocaleString('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  message('loginMessage', '');

  try {
    await signInWithEmailAndPassword(
      auth,
      $('email').value.trim(),
      $('password').value
    );
  } catch (error) {
    message('loginMessage', readableError(error), true);
  } finally {
    button.disabled = false;
  }
});

$('logoutButton').addEventListener('click', () => signOut(auth));

$('awardButton').addEventListener('click', async () => {
  if (!currentUser || !isAdmin) {
    message('awardMessage', 'Bạn không có quyền tích xu.', true);
    return;
  }

  const uid = $('recipient').value;
  if (!uid) {
    message('awardMessage', 'Hãy chọn người yêu trước nhé.', true);
    return;
  }

  const button = $('awardButton');
  button.disabled = true;
  message('awardMessage', 'Đang gửi một chút yêu thương...');

  try {
    const result = await awardCoins({
      uid,
      amount: 1,
      note: $('note').value.trim(),
    });

    message(
      'awardMessage',
      `Đã tặng 1 xu thành công ♡ Hôm nay đã nhận ${result.data.dailyTotal}/4 xu.`
    );
    $('note').value = '';
  } catch (error) {
    message('awardMessage', readableError(error), true);
  } finally {
    button.disabled = false;
  }
});

onAuthStateChanged(auth, async (user) => {
  cleanup();
  currentUser = user;
  isAdmin = false;

  $('loginPanel').hidden = !!user;
  $('homePanel').hidden = !user;
  $('adminPanel').hidden = true;

  if (!user) return;

  $('accountEmail').textContent = user.email || '';

  try {
    const token = await getIdTokenResult(user, true);
    isAdmin = token.claims.admin === true;
    $('adminPanel').hidden = !isAdmin;

    stopProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => {
        if (!snapshot.exists()) {
          message('awardMessage', 'Hồ sơ đang được khởi tạo.');
          return;
        }

        const profile = snapshot.data();
        $('balance').textContent = profile.balance ?? 0;
        $('lifetime').textContent = `${profile.lifetimeEarned ?? 0} xu`;
      },
      (error) => console.error('Profile:', error)
    );

    stopHistory = onSnapshot(
      query(
        collection(db, 'coinHistory'),
        where('uid', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(30)
      ),
      (snapshot) => {
        const list = $('historyList');
        list.replaceChildren();

        if (snapshot.empty) {
          const empty = document.createElement('p');
          empty.className = 'muted';
          empty.textContent =
            'Chưa có xu nào được tích. Hành trình bắt đầu từ hôm nay ♡';
          list.append(empty);
          return;
        }

        snapshot.forEach((item) => {
          const data = item.data();

          const row = document.createElement('div');
          row.className = 'history-item';

          const heart = document.createElement('div');
          heart.className = 'history-heart';
          heart.textContent = '♥';

          const description = document.createElement('div');
          description.className = 'history-description';

          const title = document.createElement('strong');
          title.textContent = data.note || 'Xu yêu thương';

          const date = document.createElement('small');
          date.textContent = formatDate(data.createdAt);

          const amount = document.createElement('div');
          amount.className = 'history-amount';
          amount.textContent = `+${data.amount} xu`;

          description.append(title, date);
          row.append(heart, description, amount);
          list.append(row);
        });
      },
      (error) => console.error('History:', error)
    );

    if (isAdmin) {
      stopMembers = onSnapshot(
        collection(db, 'users'),
        (snapshot) => {
          const select = $('recipient');
          const previous = select.value;
          select.replaceChildren();

          const placeholder = document.createElement('option');
          placeholder.value = '';
          placeholder.textContent = '-- Chọn người yêu --';
          select.append(placeholder);

          snapshot.forEach((item) => {
            const member = item.data();
            if (item.id === user.uid) return;

            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = member.email || item.id;
            select.append(option);
          });

          if ([...select.options].some((o) => o.value === previous)) {
            select.value = previous;
          }
        },
        (error) => console.error('Members:', error)
      );
    }
  } catch (error) {
    console.error(error);
    await signOut(auth);
  }
});
