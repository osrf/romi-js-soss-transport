cmake_minimum_required(VERSION 3.5.0)

project(romi-js-soss-transport-soss-plugin)

find_package(soss-rosidl REQUIRED)
find_package(soss-ros2 REQUIRED)
find_package(std_msgs REQUIRED)
find_package(std_srvs REQUIRED)

soss_rosidl_mix(
  PACKAGES
    std_msgs
    std_srvs
  MIDDLEWARES
    ros2
)