# Seat Reservation Service
REST API service to manage an event seat reservation

# Idea
The main goal is to create a service that supports a busy online reservation system using NodeJS, Redis and Docker.
You can create events and specify how many seats are available. A user can hold a seat for 60s and while he is holding, the user can permanently reserve it.
A user is also allowed to refresh the hold he has on a seat for another 60s period.

With this said, the service also allows to limit the amount of seats a given user can hold in an event. This limit is set at the point the event is created

## Approach
All roads lead to rome... an old saying that is very true to IT. Meaning, there are many ways to implement an idea.

The biggest challenge an online booking systems faces is race conditions, due to the high concurrency it can get, specially for those much wanted events.
If we take it to the extreme, we would need rate limiting, queues, asynchronous communication model, cqrs to scale individually reads from writes and on and on we could go.

For this test however, I focused on developing a service that could prove our idea and is easy to maintain, readable (at least I hope) and ultimately would allow us to fail fast.

In a nutshell, we keep two lists to tell us which seats are available and which are being held. When a user wants a seat, he needs to acquire a lock.
If he is successful, he can hold that seat and the lists are updated accordingly. Off course there are more to this but this is the very, very high view of it.

<!-- TOC -->
* [Seat Reservation Service](#seat-reservation-service)
* [Idea](#idea)
  * [Approach](#approach)
* [Architecture](#architecture)
  * [OpenApi specification](#openapi-specification)
  * [Considerations](#considerations)
    * [Concurrency control](#concurrency-control)
    * [Redis](#redis)
    * [Testing](#testing)
    * [Time assertions](#time-assertions)
    * [Uniqueness](#uniqueness)
    * [Throw rather than return an error status](#throw-rather-than-return-an-error-status)
* [How to run](#how-to-run)
* [How to test](#how-to-test)
* [Improvements](#improvements)
<!-- TOC -->

# Architecture
Considering the test constraints, we have just used redis to hold our models. And to be honest, taking this to production, redis is fit for the temporary information the service handles, like hold and available seats,
But we are disregarding the reserved seats precisely because these would need to be stored in disk with a dbms. So I would just include a persistence layer. Nosql would be preferred

We use redis sets to hold
* The list of available seats
* The list of seats that are being held
* The list of seats a particular user is holding

We use redis hashes to hold
* The event definition

And finally we use the very famous strings to hold
* Writing locks: to be used when we wish to write data
* Held seats. That expire when the user had been holding it for too long

## OpenApi specification
After successfully completing the steps outlined in the "how to run" section, you should be able to access the service's endpoints specifications by typing `http://localhost:3000/api` into your preferred browser's address bar.
The resulting page provides details for each endpoint. However, it's essential to understand that this page will be disabled in production for security purposes.

## Considerations
### Concurrency control
You might be wondering as to why I chose locks as a solution to concurrency control, considering they come with their own set of challenges, such as potential deadlocks, performance overhead, and scalability limitations, especially as the service becomes more distributed.
I could have gone with event sourcing. Is more scalable, more performant and offers out of the box auditability and quicker adaptation to when our models change.

However, event sourcing does introduce complexity, especially in terms of event handling and replay. Debugging is harder because we don't know immediately the current state of the system. Which also leads us to the other nasty, eventual consistency.
For these reasons, I believe complexity should be introduced as needed, and we should always try simplicity first. By simplicity, I mean, easy to maintain, to get our heads around it.

### Redis
For the sake of simplicity, and time to develop the test, I have assumed the app would be running against one redis instance and not a cluster. And one could argue that we do not need locks considering redis is single-threaded.
However, even a single instance cannot avoid the wrath of race conditions. This is why I have done locks with an expiration and set to an owner. As to avoid the typical issues with simple locks, particularly, deadlocks and deleting a lock that is no longer being held by the process

One thing to note is that when we found the need to move into a redis cluster, we would need to update the locks to handle distributed environment. Luckily, there are already many libraries for the Redis RedLock, so it should not be as hard as doing it from scratch.

### Testing
I did consider setting up a docker environment to test more accurately the integration between the app and redis but that would mean having two different ways of testing. 
But I believe this to be slower than just your normal `jest` run because you would need to build a new image of your app every time a feature, or bug, got corrected

### Time assertions
Time assertions are always tricky, specially when you run them in different machines or just when processes get paused during their execution. So I preferred to not assert the refresh time on a held seat because you could get a failing test and that is not nice.
In production, I would either work with a time manipulation library or inject into the app a custom service. The service would give me the current time and then in my tests, I could mock the service and therefore have deterministic tests

### Uniqueness
When we're creating an event, there should be more fields to uniquely define an event like location, dates for when its happening and so on. But for the sake of time, I'm just taking in the event name. 
In line with this, you will find little methods to generate keys that have been deliberately isolated to allow us to update in one place what makes up an event id in the future.

### Throw rather than return an error status
This is more of a heads-up. You will not find a lot of checks in the code as you might expect. Specially in the controllers. This is because I believe in the mindset that we should throw rather than returning error codes or states.
Returning implies if-else statements that make the code harder to read. It also expects a developer to act on it and therefore can introduce bugs.
An exception on the other hand, forces you to handle it as it happens, and you can catch it at the top leaving most of your code, written for the happy path (in most cases)

# How to run
`npm start`
and when you have had enough fun
`npm stop`

# How to test
`npm test`

# Improvements

Add an endpoint to close an event. So we could remove entries being held in redis and avoid the dreaded evictions or paying high costs.
In line with this idea, event without a close event, we would need to manage the lifetime of the entries in redis.

Review configurations because using the defaults isn't always the best choice. Particularly the redis configuration on retry strategy.

Introduce transactions to keep the state consistent when unexpected errors occur in the midst of any operation. For instance on event creation or when managing a held seat.

The typical measures you would find in a productions environment like api security, load tests, json log formating, and so on.