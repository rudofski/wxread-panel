<template>
  <div class="books-page"><h2 class="page-title">📚 书城选书</h2>
    <div class="card"><div class="form-group"><div class="input-group"><input v-model="keyword" class="form-input" placeholder="搜索书名或作者，如：三体" @keyup.enter="handleSearch" /><button class="btn btn-primary" @click="handleSearch" :disabled="loading">{{ loading ? '搜索中...' : '搜索' }}</button></div></div></div>

    <div v-if="results.length > 0" class="card"><div class="card-title">搜索结果 ({{ results.length }})</div>
      <div v-for="book in results" :key="book.bookId" class="book-item">
        <div class="book-cover-placeholder">📖</div>
        <div class="book-info"><div class="book-title">{{ book.title }}</div><div class="book-author">{{ book.author }}</div></div>
        <button class="btn" :class="selectedIds.has(book.bookId) ? 'btn-primary' : 'btn-default'" @click="toggleBook(book)">{{ selectedIds.has(book.bookId) ? '已添加' : '+ 添加' }}</button>
      </div>
    </div>
    <div v-else-if="searched" class="card"><div class="empty">未找到相关书籍</div></div>

    <div v-if="selectedBookList.length > 0" class="card"><div class="card-title">已选书籍 ({{ selectedBookList.length }})</div>
      <div v-for="book in selectedBookList" :key="book.bookId" class="book-item">
        <span>📖</span><span class="book-title">{{ book.title }}</span><span class="book-id">{{ book.bookId }}</span><button class="btn btn-default btn-sm" @click="removeBook(book.bookId)">移除</button>
      </div>
    </div>
    <div v-else class="card"><div class="empty">暂未选择书籍</div></div>

    <div class="card"><button class="btn btn-primary" @click="saveBooks">💾 保存到 wxread</button></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { searchBooks, type BookInfo } from '@/api/weread';
import { useSettingsStore } from '@/stores/settings';
const settings = useSettingsStore();
const keyword = ref(''), results = ref<BookInfo[]>([]), searched = ref(false), loading = ref(false);
const selectedBooks = ref<Map<string, BookInfo>>(new Map());
const selectedIds = computed(() => new Set(selectedBooks.value.keys()));
const selectedBookList = computed(() => Array.from(selectedBooks.value.values()));
async function handleSearch() {
  const kw = keyword.value.trim();
  if (!kw) return;
  loading.value = true;
  try { results.value = await searchBooks(kw); searched.value = true; } catch { results.value = []; searched.value = true; }
  finally { loading.value = false; }
}
function toggleBook(book: BookInfo) { if (selectedBooks.value.has(book.bookId)) selectedBooks.value.delete(book.bookId); else selectedBooks.value.set(book.bookId, { ...book }); }
function removeBook(bookId: string) { selectedBooks.value.delete(bookId); }
async function saveBooks() {
  settings.selectedBooks = selectedBookList.value.map(b => b.bookId);
  try { await settings.saveConfig(); alert('书籍列表已保存'); } catch (e: any) { alert(`保存失败：${e.message}`); }
}
</script>

<style scoped>
.books-page { max-width: 700px; }
.input-group { display: flex; gap: 8px; }
.input-group .form-input { flex: 1; }
.book-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--color-border); }
.book-item:last-child { border-bottom: none; }
.book-cover-placeholder { width: 36px; height: 48px; background: #f0f0f0; border-radius: 4px; display: flex; align-items: center; justify-content: center; }
.book-info { flex: 1; }
.book-title { font-weight: 500; }
.book-author { font-size: 12px; color: var(--color-text-light); }
.book-id { font-size: 11px; color: var(--color-text-light); font-family: monospace; }
.btn-sm { padding: 2px 10px; font-size: 12px; }
</style>