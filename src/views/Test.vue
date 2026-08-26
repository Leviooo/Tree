<template>
    <ul id="list">
        <li>
            <span>A</span>
        </li>
    </ul>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';

onMounted(() => {

    const list = document.querySelector('#list')

    list?.addEventListener('click', (e) => {
        console.log(e.target, e.currentTarget)
    })
})

</script>