<template>
    <div id="map" class="map-container"></div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { initBaiduMap } from '@/utils/map';

let map:any
onMounted(() => {
    map = initBaiduMap('map')
})

</script>

<style scoped>

.map-container {
    height: 100vh;
    width: 100vw;
}
</style>