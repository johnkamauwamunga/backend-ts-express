import {createClient} from 'redis';


const redisServer = createClient({
    url:'redis://localhost:6379'
});

export default redisServer;