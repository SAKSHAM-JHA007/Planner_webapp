async function fetchUserTasks(userId) {
    const res = await fetch('/api/tasks?userId=' + userId);
    return await res.json();
}
