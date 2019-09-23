'use strict';

module.exports = {
    client: {
        css: [
            'hydrafloodviewer/static/css/main.css',
            'hydrafloodviewer/static/css/home.css',
            'hydrafloodviewer/static/css/footer.css',
            'hydrafloodviewer/static/css/navigation.css',
            'hydrafloodviewer/static/css/usecase.css',
        ],
        js: [
            'hydrafloodviewer/static/app/*.js',
            'hydrafloodviewer/static/app/**/*.js'
        ],
        views: [
            'hydrafloodviewer/templates/*.html',
            'hydrafloodviewer/templates/**/*.html',
        ],
        templates: ['static/templates.js']
    },
    server: {
        gulpConfig: ['gulpfile.js']
    }
};
