import style from './style.css';
const viewerClass = 'simulo-viewer';

/** Gets the relevant location from a mouse or single touch event */
function getEventLocation(e: MouseEvent | TouchEvent) {
    // check if its a touch event
    if (e instanceof TouchEvent) {
        if (e.touches && e.touches.length == 1) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    }
    else if (e.clientX && e.clientY) {
        return { x: e.clientX, y: e.clientY };
    }
    return { x: 0, y: 0 };
}

function rotateVerts(verts: { x: number, y: number }[], angle: number) {
    // rotate the vertices at the origin (0,0)
    var rotatedVertices: { x: number, y: number }[] = [];
    for (var i = 0; i < verts.length; i++) {
        // use math to rotate the vertices
        var rotatedX = verts[i].x * Math.cos(angle) - verts[i].y * Math.sin(angle);
        var rotatedY = verts[i].x * Math.sin(angle) + verts[i].y * Math.cos(angle);
        // add the rotated vertices to the array
        rotatedVertices.push({ x: rotatedX, y: rotatedY });
    }
    return rotatedVertices;
}

/** Displays shapes and images on a canvas at high performance, typically paired with `SimuloClientController` or a custom controller. */
class SimuloViewer {
    /** Whether the viewer is currently running, should only be altered by `start()` and `stop()` */
    private running: boolean = false;
    /** The drawing context of the canvas. You can use it directly for low-level drawing, but this should rarely be needed. */
    ctx: CanvasRenderingContext2D;
    /** The canvas that the viewer is drawing to. You can update this along with `ctx` to change the canvas mid-run. */
    canvas: HTMLCanvasElement;
    cameraOffset: { x: number, y: number };
    cameraZoom = 30;
    private lastX: number;
    private lastY: number;
    // lastX is for touch and mouse, these are specifically for mouse
    private lastMouseX: number;
    private lastMouseY: number;
    touchStartElement: HTMLElement | null = null;
    isDragging = false;
    dragStart = { x: 0, y: 0 };
    dragStart2 = { x: 0, y: 0 };
    pointerDown = false;
    initialPinchDistance: number | null = null;
    lastZoom = this.cameraZoom;

    keysDown: { [key: number]: boolean } = {};

    previousPinchDistance: number | null = null;

    private cachedImages: { [key: string]: HTMLImageElement } = {};
    getImage(src: string) {
        if (this.cachedImages[src] != undefined) {
            return this.cachedImages[src];
        }
        else {
            var img = new Image();
            img.src = src;
            this.cachedImages[src] = img;
            return img;
        }
    }

    listeners: { [key: string]: Function[] } = {};
    /** Emit data to listeners. Call `on` to add listeners and `off` to remove them. */
    emit(event: string, data: any = null) {
        if (this.listeners[event]) {
            this.listeners[event].forEach((listener) => {
                if (data == null) {
                    listener();
                }
                else {
                    listener(data);
                }
            });
        }
    }
    on(event: string, listener: Function) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(listener);
    }
    off(event: string, listener: Function) {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter((l) => l != listener);
        }
    }

    /** Transform a point from screen space to world space */
    transformPoint(x: number, y: number) {
        var newX, newY;
        newX = (x - this.ctx.getTransform().e) / (this.ctx.getTransform().a);
        newY = (y - this.ctx.getTransform().f) / (this.ctx.getTransform().d);
        return { x: newX, y: newY };
    }

    /** Transform a point from world space to screen space */
    inverseTransformPoint(x: number, y: number) {
        var newX, newY;
        newX = (x * this.ctx.getTransform().a) + this.ctx.getTransform().e;
        newY = (y * this.ctx.getTransform().d) + this.ctx.getTransform().f;
        return { x: newX, y: newY };
    }

    /** Start a loop that calls `draw()` as fast as possible, up to the display's refresh rate. (`window.requestAnimationFrame`) */
    start() {
        this.running = true;
        window.requestAnimationFrame(this.loop);
    }
    /** Stop the loop that calls `draw()`, can be restarted with `start()` */
    stop() {
        this.running = false;
    }
    /** The loop that calls `draw()`, should not be called manually, just call `draw()` directly instead for that. */
    loop() {
        // For consistency so it always draws on loop call, we don't include the draw() call in the if statement.
        this.draw();
        if (this.running) {
            window.requestAnimationFrame(this.loop);
        }
    }
    /** Draw the current state of the world to the canvas or other drawing context. */
    draw() {

    }
    constructor(canvas: HTMLCanvasElement) {
        console.log("SimuloViewer constructor");
        this.canvas = canvas;
        this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
        var windowEnd = this.transformPoint(this.canvas.width, this.canvas.height);
        this.cameraOffset = { x: windowEnd.x / 2, y: (windowEnd.y / 2) - 700 }; // start at center, offset by 700. can be changed later by controller

        this.lastX = window.innerWidth / 2;
        this.lastY = window.innerHeight / 2;
        this.lastMouseX = this.lastX;
        this.lastMouseY = this.lastY;

        this.canvas.addEventListener('touchstart', (e) => {
            this.touchStartElement = e.target as HTMLElement;
        });
        this.canvas.addEventListener('touchend', (e) => this.handleTouch(e, this.onPointerUp));
        this.canvas.addEventListener('mousemove', this.onPointerMove);
        this.canvas.addEventListener('touchmove', (e) => this.handleTouch(e, this.onPointerMove));
        this.canvas.addEventListener('wheel', (e) => this.adjustZoom((-e.deltaY) > 0 ? 1.1 : 0.9, null, null));

        // look for a #simulo-viewer-style element, if it doesn't exist, create it
        var styleElement = document.getElementById("simulo-viewer-style");
        if (!styleElement) {
            var head = document.head || document.getRootNode().appendChild(document.createElement('head'));
            styleElement = document.createElement('style');
            styleElement.id = "simulo-viewer-style";
            head.appendChild(styleElement);

            styleElement.appendChild(document.createTextNode(style));
        }

        this.canvas.classList.add(viewerClass);


        this.canvas.addEventListener('mousedown', (e) => {
            this.onPointerDown(e);
            // stop propagation to prevent text selection
            e.stopPropagation();
            e.preventDefault();
            return false;
        });
        this.canvas.addEventListener('mouseup', (e) => {
            this.onPointerUp(e);
            e.stopPropagation();
            e.preventDefault();
            return false;
        });

        this.canvas.addEventListener('touchstart', (e) => {
            this.handleTouch(e, this.onPointerDown);
            e.stopPropagation();
            e.preventDefault();
            return false;
        });

        window.addEventListener('resize', () => {
            this.draw();
        }, false);
    }

    onPointerMove(e: MouseEvent | TouchEvent) {
        if (this.isDragging) {
            this.cameraOffset.x = getEventLocation(e).x - this.dragStart.x;
            this.cameraOffset.y = getEventLocation(e).y - this.dragStart.y;
        }

        this.lastX = getEventLocation(e).x;
        this.lastY = getEventLocation(e).y;

        this.lastMouseX = getEventLocation(e).x;
        this.lastMouseY = getEventLocation(e).y;

        // send mouse position to server
        var mousePos = this.transformPoint(getEventLocation(e).x, getEventLocation(e).y);
        this.emit("mouseMove", {
            x: mousePos.x,
            y: mousePos.y
        });
    }
    drawVertsAt(x: number, y: number, verts: { x: number, y: number }[], rotation = 0) {
        this.ctx.beginPath();
        verts = rotateVerts(verts, rotation);
        verts.forEach(e => {
            this.ctx.lineTo((e.x + x), (e.y + y));
        });
        this.ctx.closePath();
        //ctx.strokeStyle = '#000000a0';

        this.ctx.save();
        this.ctx.clip();
        this.ctx.lineWidth *= 2;
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.restore();
        /*
            ctx.fill();
            ctx.stroke();
            */
    }
    drawVertsNoFillAt(x: number, y: number, verts: { x: number, y: number }[], rotation = 0) {
        this.ctx.beginPath();
        verts = rotateVerts(verts, rotation);
        verts.forEach(e => {
            this.ctx.lineTo((e.x + x), (e.y + y));
        });
        this.ctx.closePath();
        // set stroke color
        this.ctx.strokeStyle = '#9ac4f1';
        // set line width
        this.ctx.lineWidth = 0.01;
        this.ctx.stroke();
        // reset to transparent
        this.ctx.strokeStyle = 'transparent';
    }

    drawCircleAt(x: number, y: number, radius: number, rotation = 0, circleCake = false) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.stroke();
        // if circleCake, draw a partial circle (20 degrees)
        if (circleCake) {
            // fill color darker
            this.ctx.fillStyle = '#00000080';
            this.ctx.strokeStyle = 'transparent';
            this.ctx.beginPath();
            //ctx.arc(x, y, radius, 0, 20 * Math.PI / 180);
            // offset based on rotation
            this.ctx.arc(x, y, radius, rotation, rotation + 23 * Math.PI / 180);
            this.ctx.lineTo(x, y);
            this.ctx.closePath();
            this.ctx.fill();
        }
    }





    onPointerDown(e: MouseEvent | TouchEvent) {
        var mousePos = this.transformPoint(getEventLocation(e).x, getEventLocation(e).y);
        if (e instanceof TouchEvent) {
            this.emit("mouseDown");
            this.pointerDown = true;
        }
        else {
            if (e.button == 2 || e.button && 3) {
                this.isDragging = true;
                this.dragStart.x = getEventLocation(e).x - this.cameraOffset.x;
                this.dragStart.y = getEventLocation(e).y - this.cameraOffset.y;

                this.dragStart2.x = getEventLocation(e).x;
                this.dragStart2.y = getEventLocation(e).y;
            }
            // if its not those buttons, we will see how much cursor moves first

            if (e.button == 0) {
                this.emit("mouseDown");
                this.pointerDown = true;
            }
        }
    }

    onPointerUp(e: MouseEvent | TouchEvent) {
        if (e instanceof TouchEvent) {
            this.pointerDown = false;
            var mousePos = this.transformPoint(getEventLocation(e).x, getEventLocation(e).y);
            this.emit("mouseUp");
        }
        else {
            if (e.button == 0) {
                this.pointerDown = false;
                var mousePos = this.transformPoint(getEventLocation(e).x, getEventLocation(e).y);
                this.emit("mouseUp");
            }
        }
        this.isDragging = false;
        this.lastZoom = this.cameraZoom;
        this.initialPinchDistance = null;
    }




    handleTouch(e: TouchEvent, singleTouchHandler: (e: TouchEvent) => void) {
        if (this.touchStartElement != this.canvas) {
            return;
        }

        if (e.touches.length == 1) {
            singleTouchHandler(e);
        }
        else if (e.type == "touchmove" && e.touches.length == 2) {
            this.isDragging = false;
            this.handlePinch(e);
        }
    }



    handlePinch(e: TouchEvent) {
        e.preventDefault();

        let touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        let touch2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };

        // This is distance squared, but no need for an expensive sqrt as it's only used in ratio
        let currentDistance = (touch1.x - touch2.x) ** 2 + (touch1.y - touch2.y) ** 2;
        if (!this.previousPinchDistance)
            this.previousPinchDistance = currentDistance;

        if (this.initialPinchDistance == null) {
            this.initialPinchDistance = currentDistance;
        }
        else {
            this.adjustZoom((currentDistance - this.previousPinchDistance) > 0 ? 1.05 : (currentDistance - this.previousPinchDistance) < 0 ? 0.95 : 0, null, { x: (touch1.x + touch2.x) / 2, y: (touch1.y + touch2.y) / 2 });
        }

        this.previousPinchDistance = currentDistance;
    }

    scaleAt(x: number, y: number, scaleBy: number) {  // at pixel coords x, y scale by scaleBy
        this.cameraZoom *= scaleBy;
        this.cameraOffset.x = x - (x - this.cameraOffset.x) * scaleBy;
        this.cameraOffset.y = y - (y - this.cameraOffset.y) * scaleBy;
    }

    adjustZoom(zoomAmount: number | null, zoomFactor: number | null, center: { x: number, y: number } | null) {
        if (!this.isDragging) {
            if (center) {
                this.lastX = center.x;
                this.lastY = center.y;
            }
            if (zoomAmount) {
                // cameraZoom += zoomAmount
                this.scaleAt(this.lastX, this.lastY, zoomAmount);
            }
            else if (zoomFactor) {
                console.log(zoomFactor + ' is zoom factor');
                this.scaleAt(this.lastX, this.lastY, zoomFactor);
                // cameraZoom = zoomFactor * lastZoom
            }

            //cameraZoom = Math.min(cameraZoom, MAX_ZOOM)
            //cameraZoom = Math.max(cameraZoom, MIN_ZOOM)

            console.log(zoomAmount)

            // mouse moved, lets send
            var mousePos = this.transformPoint(this.lastX, this.lastY);
            this.emit("mouseMove", { x: mousePos.x, y: mousePos.y });
        }
    }

    /** Adds or removes `.fullscreen` class from the canvas element, which has CSS to make it fill the screen. */
    setFullscreen(fullscreen: boolean) {
        if (fullscreen) {
            this.canvas.classList.add("fullscreen");
        }
        else {
            this.canvas.classList.remove("fullscreen");
        }
    }
    /** Returns true if the canvas element has the `.fullscreen` class. */
    get fullscreen(): boolean {
        return this.canvas.classList.contains("fullscreen");
    }

    /** Adds or removes `.cursor` class from the canvas element, which has CSS to make it show the system cursor or hide it. */
    get systemCursor(): boolean {
        return this.canvas.classList.contains('cursor');
    }
    set systemCursor(value: boolean) {
        if (value) {
            this.canvas.classList.add('cursor');
        }
        else {
            this.canvas.classList.remove('cursor');
        }
    }

    drawVerts(verts: { x: number, y: number }[]) {
        this.ctx.beginPath();
        verts.forEach(e => this.ctx.lineTo(e.x, e.y));
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
    }

    drawStretchedImageLine(image: HTMLImageElement, x1: number, y1: number, x2: number, y2: number, useHeight: boolean, otherAxisLength: number) {
        // if useHeight is true, we will stretch along height between p1 and p2. if false, we will stretch along width between p1 and p2
        if (useHeight) {
            // draw between 2 points, offsetting other axis by half of otherAxisLength
            var angle = Math.atan2(y2 - y1, x2 - x1);
            var length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            var halfOtherAxisLength = otherAxisLength / 2;
            this.ctx.save();
            this.ctx.translate(x1, y1);
            this.ctx.rotate(angle);
            this.ctx.drawImage(image, -halfOtherAxisLength, 0, otherAxisLength, length);
            this.ctx.restore();
        } else {
            // draw between 2 points, offsetting other axis by half of otherAxisLength
            var angle = Math.atan2(y2 - y1, x2 - x1);
            var length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            var halfOtherAxisLength = otherAxisLength / 2;
            this.ctx.save();
            this.ctx.translate(x1, y1);
            this.ctx.rotate(angle);
            this.ctx.drawImage(image, 0, -halfOtherAxisLength, length, otherAxisLength);
            this.ctx.restore();
        }
    }


    drawRect(x: number, y: number, width: number, height: number) {
        this.ctx.fillRect(x, y, width, height);
    }

    drawText(text: string, x: number, y: number, size: number, font: string) {
        this.ctx.font = `${size}px ${font}`;
        this.ctx.fillText(text, x, y);
    }

    outlinedImage(img: HTMLImageElement, s: number, color: string, x: number, y: number, width: number, height: number) {
        var canvas2 = document.createElement('canvas');
        var ctx2 = canvas2.getContext('2d') as CanvasRenderingContext2D;
        canvas2.width = width + (s * 4);
        canvas2.height = height + (s * 4);
        ctx2.imageSmoothingEnabled = false;
        // @ts-ignore
        ctx2.mozImageSmoothingEnabled = false; // we ignore because typescript doesnt know about these
        // @ts-ignore
        ctx2.webkitImageSmoothingEnabled = false;
        // @ts-ignore
        ctx2.msImageSmoothingEnabled = false;

        var dArr = [-1, -1, 0, -1, 1, -1, -1, 0, 1, 0, -1, 1, 0, 1, 1, 1], // offset array
            i = 0;  // iterator

        // draw images at offsets from the array scaled by s
        for (; i < dArr.length; i += 2)
            ctx2.drawImage(img, (1 + dArr[i] * s) + s, (1 + dArr[i + 1] * s) + s, width, height);

        // fill with color
        ctx2.globalCompositeOperation = "source-in";
        ctx2.fillStyle = color;
        ctx2.fillRect(0, 0, width + (s * 4), height + (s * 40));

        // draw original image in normal mode
        ctx2.globalCompositeOperation = "source-over";
        ctx2.drawImage(img, 1 + s, 1 + s, width, height);

        this.ctx.drawImage(canvas2, x - 1 - s, y - 1 - s);
    }

    // polyfill for roundRect
    roundRect(x: number, y: number, w: number, h: number, r: number) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x + r, y);
        this.ctx.arcTo(x + w, y, x + w, y + h, r);
        this.ctx.arcTo(x + w, y + h, x, y + h, r);
        this.ctx.arcTo(x, y + h, x, y, r);
        this.ctx.arcTo(x, y, x + w, y, r);
        this.ctx.closePath();
        return this.ctx;
    }

    roundTri(x: number, y: number, w: number, h: number) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.arcTo(x + w, y, x + w, y + h, 10);
        this.ctx.arcTo(x + w, y + h, x, y + h, 10);
        this.ctx.arcTo(x, y + h, x, y, 10);
        this.ctx.closePath();
        return this.ctx;
    }

    draw() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;



        // Translate to the canvas centre before zooming - so you'll always zoom on what you're looking directly at
        ctx.setTransform(cameraZoom, 0, 0, cameraZoom, cameraOffset.x, cameraOffset.y);

        //ctx.fillStyle = '#151832';
        var origin = transformPoint(0, 0);
        var end = transformPoint(window.innerWidth, window.innerHeight);
        var width = end.x - origin.x;
        var height = end.y - origin.y;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // draw map
        //ctx.drawImage(canvasMap, 0, 0);


        var mousePos = transformPoint(lastX, lastY); // this is also the last touch position, however we will only use it for mouse hover effects in this function so touch isnt gonna be very relevant (hence the name mousePos)

        var cursor = getImage('/assets/textures/cursor.png');

        // fill
        ctx.fillStyle = '#a1acfa';
        // no border
        ctx.strokeStyle = 'transparent';
        // the entities are verts
        for (var i = 0; i < entities.length; i++) {
            var entity = entities[i];
            var shapeSize = 1; // width of shape

            ctx.fillStyle = entity.color;
            if (entity.border) {
                ctx.strokeStyle = entity.border;
                ctx.lineWidth = entity.borderWidth as number / (entity.borderScaleWithZoom ? cameraZoom : 1);
            }
            else {
                ctx.strokeStyle = 'transparent';
            }
            if (entity.type === 'polygon') {
                let entityPolygon = entity as SimuloPolygon;
                if (!entityPolygon.points) {
                    drawVertsAt(entityPolygon.x, entityPolygon.y, entityPolygon.vertices, entityPolygon.angle);
                    entityPolygon.vertices.forEach(function (vert) {
                        if (Math.abs(vert.x) > shapeSize) shapeSize = Math.abs(vert.x);
                        if (Math.abs(vert.y) > shapeSize) shapeSize = Math.abs(vert.y);
                    });
                }
                else {
                    drawVertsAt(entityPolygon.x, entityPolygon.y, entityPolygon.points, entityPolygon.angle);
                    entityPolygon.points.forEach(function (vert) {
                        if (Math.abs(vert.x) > shapeSize) shapeSize = Math.abs(vert.x);
                        if (Math.abs(vert.y) > shapeSize) shapeSize = Math.abs(vert.y);
                    });
                }
            }
            else if (entity.type === 'circle') {
                let entityCircle = entity as SimuloCircle;
                // console.log('drawing circle');
                drawCircleAt(entityCircle.x, entityCircle.y, entityCircle.radius as number, entityCircle.angle, entityCircle.circleCake);
            }
            else if (entity.type === 'edge') {
                let entityEdge = entity as SimuloEdge;
                //console.log('drawing edge');
                drawVertsNoFillAt(entityEdge.x, entityEdge.y, entityEdge.vertices, entityEdge.angle);
            }
            else {
                //console.log('what is ' + entity.type);
            }

            shapeSize = Math.abs(shapeSize / 2.1);

            if (entity.image) {
                var image = getImage(entity.image);
                if (image) {
                    ctx.save();
                    ctx.translate(entity.x, entity.y);
                    ctx.rotate(entity.angle);
                    // rotate 180deg
                    ctx.rotate(Math.PI);
                    // width is determined based on shape size. height is determined based on image aspect ratio
                    ctx.drawImage(image, -shapeSize, -shapeSize * (image.height / image.width), shapeSize * 2, shapeSize * 2 * (image.height / image.width));
                    ctx.restore();
                }
            }
        }

        // draw springs (white line from spring.p1 (array of x and y) to spring.p2 (array of x and y))
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3 / cameraZoom;
        for (var i = 0; i < springs.length; i++) {
            var spring = springs[i];
            if (spring.image) {
                //drawStretchedImageLine(image, x1, y1, x2, y2, useHeight, otherAxisLength)
                drawStretchedImageLine(getImage(spring.image), spring.p1[0], spring.p1[1], spring.p2[0], spring.p2[1], false, 0.2);
            }
            else {
                if (spring.line) {
                    ctx.strokeStyle = spring.line.color;
                    ctx.lineWidth = spring.line.width;
                    if (spring.line.scale_with_zoom) {
                        ctx.lineWidth /= cameraZoom;
                    }
                    ctx.beginPath();
                    ctx.moveTo(spring.p1[0], spring.p1[1]);
                    ctx.lineTo(spring.p2[0], spring.p2[1]);
                    ctx.stroke();
                }
            }
        }


        for (var id in players) {
            //console.log('ID: ' + id);
            var player = players[id];
            if (id === client.id) {
                // shit
                continue;
            }
            ctx.fillStyle = 'blue';
            //drawRect(player.x, player.y, 4, 4);
            // draw image getImage('/cursor.png')
            ctx.drawImage(cursor, player.x, player.y, 0.7, cursor.height * (0.7 / cursor.width));

            if (creatingSprings[id]) {
                if (creatingSprings[id].image) {
                    //drawStretchedImageLine(image, x1, y1, x2, y2, useHeight, otherAxisLength)
                    console.log('img on spring')
                    drawStretchedImageLine(getImage(creatingSprings[id].image as string), creatingSprings[id].start[0], creatingSprings[id].start[1], player.x, player.y, false, 0.2);
                }
                else {
                    console.log('no img on spring')
                    ctx.beginPath();
                    ctx.moveTo(creatingSprings[id].start[0], creatingSprings[id].start[1]);
                    ctx.lineTo(player.x, player.y);
                    ctx.stroke();
                }
            }
            if (creatingObjects[id]) {
                if (creatingObjects[id].shape === 'rectangle' || creatingObjects[id].shape === 'select') { // selection box is a rectangle and has same properties for rendering
                    // Calculate the difference between creatingObjects[id] x and y and the current player x and y
                    const width = Math.abs(player.x - creatingObjects[id].x);
                    const height = Math.abs(player.y - creatingObjects[id].y);

                    // Determine the top-left corner of the rectangle
                    const topLeftX = Math.min(player.x, creatingObjects[id].x);
                    const topLeftY = Math.min(player.y, creatingObjects[id].y);

                    // Set the fill style to transparent white
                    //ctx.fillStyle = creatingObjects[id].color;
                    // we have "rgba(R, G, B, A)". lets change A to be half of what it is
                    var splitColor = creatingObjects[id].color.split(',');
                    var alpha = parseFloat(splitColor[3].trim().slice(0, -1));
                    alpha = alpha / 2;
                    splitColor[3] = alpha + ')';
                    var newColor = splitColor.join(',');
                    ctx.fillStyle = newColor;

                    // Draw the rectangle
                    ctx.fillRect(topLeftX, topLeftY, width, height);
                }
                else if (creatingObjects[id].shape === 'circle') {
                    // radius is math.max of differences in x and y
                    var dx = (player.x - creatingObjects[id].x);
                    var dy = (player.y - creatingObjects[id].y);
                    var radius = Math.max(Math.abs(dx), Math.abs(dy)) / 2;

                    // Set the fill style to transparent white
                    //ctx.fillStyle = creatingObjects[id].color;
                    // we have "rgba(R, G, B, A)". lets change A to be half of what it is
                    var splitColor = creatingObjects[id].color.split(',');
                    var alpha = parseFloat(splitColor[3].trim().slice(0, -1));
                    alpha = alpha / 2;
                    splitColor[3] = alpha + ')';
                    var newColor = splitColor.join(',');
                    ctx.fillStyle = newColor;

                    // Draw the circle
                    drawCircleAt(creatingObjects[id].x + radius, creatingObjects[id].y + radius, radius, 0, true);
                }
            }
            else {
                console.log('no color');
            }
        }

        ctx.fillStyle = 'red';
        var cursorSize = 1;
        var scaleWithZoom = true;
        if (scaleWithZoom) {
            cursorSize = cursorSize * 40 / cameraZoom;
        }
        if (!systemCursor) {
            ctx.drawImage(cursor, mousePos.x, mousePos.y, (0.7 * cursorSize), (cursor.height * ((0.7 * cursorSize) / cursor.width)));
        }
        if (toolIcon) {
            console.log('drawing tool icon');
            ctx.drawImage(getImage(toolIcon), mousePos.x + (((toolIconOffset as [x: number, y: number])[0] * cursorSize)), mousePos.y + (((toolIconOffset as [x: number, y: number])[1] * cursorSize)), (toolIconSize as number * cursorSize), (toolIconSize as number * cursorSize));
        }
        if (client.id) {
            if (creatingSprings[client.id]) {
                if (creatingSprings[client.id].image) {
                    //drawStretchedImageLine(image, x1, y1, x2, y2, useHeight, otherAxisLength)
                    console.log('img on spring')
                    drawStretchedImageLine(getImage(creatingSprings[client.id].image as string), creatingSprings[client.id].start[0], creatingSprings[client.id].start[1], mousePos.x, mousePos.y, false, 0.2);
                }
                else {
                    console.log('no img on spring')
                    ctx.beginPath();
                    ctx.moveTo(creatingSprings[client.id].start[0], creatingSprings[client.id].start[1]);
                    ctx.lineTo(mousePos.x, mousePos.y);
                    ctx.stroke();
                }
            }
            if (creatingObjects[client.id]) {
                if (creatingObjects[client.id].shape === 'rectangle' || creatingObjects[client.id].shape === 'select') {
                    // Calculate the difference between creatingObjects[id] x and y and the current player x and y
                    const width = Math.abs(mousePos.x - creatingObjects[client.id].x);
                    const height = Math.abs(mousePos.y - creatingObjects[client.id].y);

                    // Determine the top-left corner of the rectangle
                    const topLeftX = Math.min(mousePos.x, creatingObjects[client.id].x);
                    const topLeftY = Math.min(mousePos.y, creatingObjects[client.id].y);

                    // Set the fill style to transparent white
                    //ctx.fillStyle = creatingObjects[client.id].color;
                    // empty fill
                    var splitColor = creatingObjects[client.id].color.split(',');
                    console.log('splitColor: ' + splitColor);
                    var alpha = parseFloat(splitColor[3].trim().slice(0, -1));
                    alpha = alpha / 2;
                    splitColor[3] = alpha + ')';
                    var newColor = splitColor.join(',');
                    console.log('newColor: ' + newColor);
                    ctx.fillStyle = newColor;
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 3.5 / cameraZoom;

                    // Draw the rectangle
                    //ctx.fillRect(topLeftX, topLeftY, width, height);
                    ctx.fillRect(topLeftX, topLeftY, width, height);
                    ctx.strokeRect(topLeftX, topLeftY, width, height);
                    // text of width and height
                    ctx.fillStyle = 'white';
                    ctx.font = (20 / cameraZoom) + 'px Arial';

                    ctx.fillText(width.toFixed(1), topLeftX + width / 2, topLeftY - 0.1);
                    ctx.fillText(height.toFixed(1), topLeftX - 0.1, topLeftY + height / 2);
                }
                else if (creatingObjects[client.id].shape === 'circle') {
                    var dx = (mousePos.x - creatingObjects[client.id].x);
                    var dy = (mousePos.y - creatingObjects[client.id].y);
                    var radius = Math.max(Math.abs(dx), Math.abs(dy)) / 2;

                    var splitColor = creatingObjects[client.id].color.split(',');
                    var alpha = parseFloat(splitColor[3].trim().slice(0, -1));
                    alpha = alpha / 2;
                    splitColor[3] = alpha + ')';
                    var newColor = splitColor.join(',');
                    ctx.fillStyle = newColor;
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 3.5 / cameraZoom;

                    // if dx is negative
                    var posX = creatingObjects[client.id].x + radius;
                    var posY = creatingObjects[client.id].y + radius;
                    if (dx < 0) {
                        posX = creatingObjects[client.id].x - radius;
                    }
                    if (dy < 0) {
                        posY = creatingObjects[client.id].y - radius;
                    }

                    // Draw the circle
                    this.drawCircleAt(posX, posY, radius, 0, creatingObjects[client.id].circleCake);
                }
                // if polygon,just drawvertsat
                else if (creatingObjects[client.id].shape === 'polygon') {
                    var splitColor = creatingObjects[client.id].color.split(',');
                    var alpha = parseFloat(splitColor[3].trim().slice(0, -1));
                    alpha = alpha / 2;
                    splitColor[3] = alpha + ')';
                    var newColor = splitColor.join(',');
                    ctx.fillStyle = newColor;
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 3.5 / cameraZoom;

                    console.log('creatingObjects[client.id]:', creatingObjects[client.id]);

                    var points = (creatingObjects[client.id] as SimuloCreatingPolygon).vertices;
                    console.log('points:', points);
                    //points.push(points[0]);

                    var pointsMapped = points.map(function (point) {
                        console.log('point:', point);
                        // add a dot at the point
                        shapes.push({
                            x: point[0] - 0.05, y: point[1] - 0.05, radius: 0.1, rotation: 0, circleCake: false
                        });
                        return { x: point[0], y: point[1] };
                    });

                    // Draw the circle
                    drawVertsAt(0, 0, pointsMapped, 0);
                }
            }
        }

        // draw text that says mouse pos in world space
        ctx.fillStyle = 'white';
        ctx.font = '0.2px Arial';
        // round to 1 decimal place
        var mousePosXRound = Math.round(mousePos.x * 10) / 10;
        var mousePosYRound = Math.round(mousePos.y * 10) / 10;
        //ctx.fillText('(' + mousePosXRound + ', ' + mousePosYRound + ')', mousePos.x + 0.2, mousePos.y);
    }
}

export default SimuloViewer;